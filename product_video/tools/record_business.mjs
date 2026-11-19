// Performs the business workflow in the real app (demo database): add a business, build its order form, take an order from the
// public order page, manage the order, then create an invoice. One highlighted screenshot per step.
// Output: pipeline/out/video_business/steps/<id>.png and steps.json
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../pipeline/out/video_business/steps");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const WEB = "http://localhost:5188";
const API = "http://localhost:4000/api";
const NAME = "Golden Crust Bakery";

const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bootcamp.admin@example.com", password: "ProgramAdmin123!" }) })).json();
const auth = { Authorization: `Bearer ${login.data.accessToken}`, "Content-Type": "application/json" };
const businesses = (await (await fetch(`${API}/businesses?page=1&pageSize=50`, { headers: auth })).json()).data.items;
for (const b of businesses.filter((b) => b.name === NAME)) await fetch(`${API}/businesses/${b.id}`, { method: "DELETE", headers: auth, body: "{}" }).catch(() => {});

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--disable-dev-shm-usage"] });
const newCtx = () => browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "light", deviceScaleFactor: 1 });
const admin = await newCtx();
const page = await admin.newPage();
await page.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
const focus = {};

async function shot(p, id, target = null, { full = false, pad = 10 } = {}) {
  await p.waitForTimeout(700);
  let point = [0.5, 0.45];
  if (target) {
    const box = await target.first().boundingBox().catch(() => null);
    if (box) {
      point = [(box.x + box.width / 2) / 1920, (box.y + box.height / 2) / 1080];
      await p.evaluate(({ x, y, w, h }) => {
        document.querySelectorAll(".__hl").forEach((n) => n.remove());
        const d = document.createElement("div");
        d.className = "__hl";
        d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:5px solid #f59e0b;border-radius:14px;box-shadow:0 0 0 9999px rgba(15,23,42,.28);z-index:2147483647;pointer-events:none`;
        document.body.appendChild(d);
      }, { x: box.x - pad, y: box.y - pad, w: box.width + pad * 2, h: box.height + pad * 2 });
    }
  }
  await p.screenshot({ path: path.join(out, `${id}.png`), fullPage: full });
  await p.evaluate(() => document.querySelectorAll(".__hl").forEach((n) => n.remove()));
  focus[id] = point;
  console.log("shot", id);
}
const step = async (p, id, fn) => {
  try {
    await fn();
  } catch (e) {
    console.log("STEP FAILED", id, e.message.split("\n")[0].slice(0, 170));
    await p.screenshot({ path: path.join(out, `${id}.failed.png`) }).catch(() => {});
  }
};
const go = async (p, route, wait = 3500) => {
  await p.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(wait);
};

await go(page, "/login", 2500);
await page.fill('input[type="email"]', "bootcamp.admin@example.com");
await page.fill('input[type="password"]', "ProgramAdmin123!");
await page.click('button[type="submit"]');
await page.waitForURL("**/admin**");

let bizId = "";
let slug = "";
await step(page, "list", async () => {
  await go(page, "/admin/businesses");
  await shot(page, "list", page.getByRole("button", { name: "New Business" }));
});
await step(page, "create_dialog", async () => {
  await page.getByRole("button", { name: "New Business" }).click();
  await page.waitForTimeout(800);
  await page.locator("#business-name").fill(NAME);
  await page.locator("#business-email").fill("orders@goldencrust.example.com");
  await page.locator("#business-phone").fill("076 555 010");
  await page.locator("#business-address").fill("8 Wilkinson Road, Freetown");
  await page.locator("#business-description").fill("Fresh bread, cakes and pastries baked every morning.");
  await shot(page, "create_dialog", page.getByRole("dialog"), { pad: 0 });
});
await step(page, "overview", async () => {
  await page.getByRole("dialog").getByRole("button", { name: /add|create|save/i }).last().click();
  await page.waitForURL(/\/admin\/businesses\/[0-9a-f-]{36}$/, { timeout: 30000 });
  bizId = page.url().split("/").pop();
  await page.waitForTimeout(3500);
  await shot(page, "overview", page.locator('a[href$="/order-form"]').first());
});

// ---- the order form
await step(page, "order_items", async () => {
  await page.locator('a[href$="/order-form"]').first().click();
  await page.waitForURL(/order-form/);
  await page.getByRole("button", { name: "Add an item" }).waitFor({ timeout: 30000 });
  const items = [["Bread loaf", "15"], ["Sponge cake", "90"], ["Meat pies (6)", "45"]];
  for (const [i, [name, price]] of items.entries()) {
    await page.getByRole("button", { name: "Add an item" }).click();
    await page.waitForTimeout(600);
    await page.getByPlaceholder("e.g. Rice, 25 kg bag").nth(i).fill(name);
    await page.getByPlaceholder("0.00").nth(i).fill(price);
  }
  await page.getByRole("button", { name: "Add an item" }).scrollIntoViewIfNeeded();
  await shot(page, "order_items", page.getByPlaceholder("e.g. Rice, 25 kg bag").first(), { pad: 30 });
});
const addField = async (type, label, required = false) => {
  await page.locator('[role="combobox"]').last().click();
  await page.getByRole("option", { name: type, exact: true }).click();
  await page.getByRole("button", { name: "Add field" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("dialog").locator("input").first().fill(label);
  if (required) await page.locator("#required").click();
  await page.getByRole("button", { name: "Save field" }).click();
  await page.waitForTimeout(600);
};
await step(page, "order_fields", async () => {
  await addField("Short Text", "Full name", true);
  await addField("Phone Number", "Phone number", true);
  await addField("Address", "Delivery address", true);
  await page.locator("text=Form title").first().locator("xpath=following::input[1]").fill("Order online");
  await page.locator("text=Confirmation message").first().locator("xpath=following::textarea[1]").fill("Thank you for your order! We will contact you soon.");
  await shot(page, "order_fields", page.getByRole("button", { name: "Edit field" }).first(), { pad: 6 });
});
await step(page, "order_publish", async () => {
  await page.getByRole("button", { name: "Save Draft" }).click();
  await page.waitForTimeout(4500);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.waitForTimeout(4500);
  await go(page, `/admin/businesses/${bizId}`);
  await page.getByRole("button", { name: "Start taking orders" }).click();
  await page.waitForTimeout(3500);
  const link = await page.locator('input[value*="/order/"]').first().inputValue();
  slug = link.split("/order/")[1];
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "order_publish", page.getByRole("button", { name: /Pause orders/ }));
});

// ---- the customer's side
const customer = await newCtx();
const cp = await customer.newPage();
await cp.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
await step(cp, "store_open", async () => {
  await cp.goto(`${WEB}/order/${slug}`, { waitUntil: "domcontentloaded" });
  await cp.getByText("Bread loaf").first().waitFor({ timeout: 40000 });
  await cp.waitForTimeout(2500);
  await shot(cp, "store_open", null);
});
await step(cp, "store_products", async () => {
  await cp.evaluate(() => document.getElementById("shop")?.scrollIntoView());
  await cp.waitForTimeout(1500);
  await shot(cp, "store_products", cp.getByText("Sponge cake").first(), { pad: 130 });
});
await step(cp, "store_cart", async () => {
  await cp.getByRole("button", { name: /Add Bread loaf to your order/ }).click();
  await cp.getByRole("button", { name: /Add Sponge cake to your order/ }).click();
  await cp.waitForTimeout(800);
  await shot(cp, "store_cart", cp.getByRole("button", { name: /Checkout/ }).first(), { pad: 20 });
});
await step(cp, "store_checkout", async () => {
  await cp.evaluate(() => document.getElementById("checkout")?.scrollIntoView());
  await cp.waitForTimeout(1200);
  await cp.getByLabel(/Full name/).fill("Mariatu Sesay");
  await cp.getByLabel(/Phone number/).fill("076 222 333");
  await cp.getByLabel(/Delivery address/).fill("14 Circular Road, Freetown");
  await cp.waitForTimeout(600);
  await shot(cp, "store_checkout", cp.getByLabel(/Full name/), { pad: 40 });
});
await step(cp, "store_review", async () => {
  const consent = cp.locator("#review-confirm");
  if (await consent.count()) await consent.click();
  await cp.getByRole("button", { name: /confirm your order/i }).click();
  await cp.waitForTimeout(1800);
  await shot(cp, "store_review", cp.getByRole("button", { name: /confirm and (place order|submit|pay)/i }));
});
await step(cp, "store_done", async () => {
  await cp.getByRole("button", { name: /confirm and (place order|submit|pay)/i }).click();
  await cp.waitForURL("**/confirmation", { timeout: 40000 });
  await cp.waitForTimeout(3500);
  await shot(cp, "store_done", null);
});

// ---- managing the order
await step(page, "orders_list", async () => {
  await go(page, `/admin/businesses/${bizId}/orders`);
  await page.getByText("Mariatu Sesay").first().waitFor({ timeout: 40000 });
  await shot(page, "orders_list", page.getByText("Mariatu Sesay").first(), { pad: 120 });
});
await step(page, "order_detail", async () => {
  await page.getByText("Mariatu Sesay").first().click();
  await page.waitForTimeout(4000);
  await shot(page, "order_detail", null);
});

// ---- an invoice
await step(page, "invoice_form", async () => {
  await go(page, `/admin/businesses/${bizId}/invoices/new`);
  await page.getByPlaceholder("Client or company name").fill("Hillside Primary School");
  await page.getByPlaceholder("Used when you send it by email").fill("office@hillside.example.com");
  await page.getByLabel("Item 1 description").fill("Sponge cake (graduation)");
  await page.getByLabel("Item 1 quantity").fill("3");
  await page.getByLabel("Item 1 unit price").fill("90");
  await shot(page, "invoice_form", page.getByLabel("Item 1 description"), { pad: 90 });
});
await step(page, "invoice_saved", async () => {
  await page.getByRole("button", { name: "Save invoice" }).click();
  await page.waitForTimeout(5000);
  await shot(page, "invoice_saved", page.getByRole("button", { name: "Send by email" }), { pad: 380 });
});
await step(page, "docs_lists", async () => {
  await go(page, `/admin/businesses/${bizId}/receipts`);
  await shot(page, "receipts", page.getByRole("link", { name: /Receipts/ }).first(), { pad: 6 });
  await go(page, `/admin/businesses/${bizId}/quotations`);
  await shot(page, "quotations", page.getByRole("link", { name: /Quotations/ }).first(), { pad: 6 });
  await go(page, `/admin/businesses/${bizId}/cards`);
  await shot(page, "cards", page.getByRole("link", { name: /Cards/ }).first(), { pad: 6 });
  await go(page, `/admin/businesses/${bizId}/analytics`, 5000);
  await shot(page, "analytics", page.getByRole("link", { name: /Analytics/ }).first(), { pad: 6 });
});

writeFileSync(path.join(out, "steps.json"), JSON.stringify({ bizId, slug, focus }, null, 2));
await browser.close();
