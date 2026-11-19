// Records the platform team's (super admin's) screens in the demo app: dashboard, organizations, one organization's page, the inbox,
// the platform fund, maintenance mode, backups and the audit log. READ-ONLY: nothing is switched on, saved, suspended, backed up or restored.
// One demo contact message is added through the public contact form so the inbox has something to show (demo database only).
// Output: pipeline/out/video_platform/steps/<id>.png and steps.json
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../pipeline/out/video_platform/steps");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const WEB = "http://localhost:5188";
const API = "http://localhost:4000/api";

// a demo message for the inbox
await fetch(`${API}/public/contact`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Demo Visitor", email: "demo.visitor@example.com", subject: "Question about ID cards", message: "Hello, can I use my own design for the ID cards of my event? Thank you." }),
}).then((r) => console.log("demo message:", r.status));

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--disable-dev-shm-usage"] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "light", deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
const focus = {};

async function shot(id, target = null, { pad = 10 } = {}) {
  await page.waitForTimeout(700);
  let point = [0.5, 0.45];
  if (target) {
    const box = await target.first().boundingBox().catch(() => null);
    if (box) {
      point = [(box.x + box.width / 2) / 1920, (box.y + box.height / 2) / 1080];
      await page.evaluate(({ x, y, w, h }) => {
        document.querySelectorAll(".__hl").forEach((n) => n.remove());
        const d = document.createElement("div");
        d.className = "__hl";
        d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:5px solid #f59e0b;border-radius:14px;box-shadow:0 0 0 9999px rgba(15,23,42,.28);z-index:2147483647;pointer-events:none`;
        document.body.appendChild(d);
      }, { x: box.x - pad, y: box.y - pad, w: box.width + pad * 2, h: box.height + pad * 2 });
    }
  }
  await page.screenshot({ path: path.join(out, `${id}.png`) });
  await page.evaluate(() => document.querySelectorAll(".__hl").forEach((n) => n.remove()));
  focus[id] = point;
  console.log("shot", id);
}
const step = async (id, fn) => {
  try {
    await fn();
  } catch (e) {
    console.log("STEP FAILED", id, e.message.split("\n")[0].slice(0, 170));
    await page.screenshot({ path: path.join(out, `${id}.failed.png`) }).catch(() => {});
  }
};
const go = async (route, wait = 6000) => {
  await page.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(wait);
};
const card = (text) => page.getByText(text, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
const bring = async (loc) => {
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(1500);
};

await go("/login", 2500);
await page.fill('input[type="email"]', "admin@example.com");
await page.fill('input[type="password"]', "SuperAdmin123!");
await page.click('button[type="submit"]');
await page.waitForURL("**/admin**");
await page.waitForTimeout(6000);

await step("sidebar", async () => {
  await shot("sidebar", page.getByRole("link", { name: "Accounts" }).first().locator("xpath=ancestor::nav[1]"), { pad: 8 });
});
await step("tenants_list", async () => {
  await go("/admin/tenants");
  await shot("tenants_list", page.getByText("Acme Training Co").first().locator("xpath=ancestor::tr[1]"), { pad: 6 });
});
let tenantHref = "";
await step("tenant_detail", async () => {
  tenantHref = await page.locator('a[href^="/admin/tenants/"]').first().getAttribute("href");
  await go(tenantHref);
  await shot("tenant_detail", page.getByText("Users", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"), { pad: 8 });
});
await step("tenant_terms", async () => {
  const c = card("Payment terms");
  await bring(c);
  await shot("tenant_terms", c, { pad: 8 });
});
await step("inbox", async () => {
  await go("/admin/inbox");
  await shot("inbox_tabs", page.getByText("Contact messages").first(), { pad: 18 });
  await page.getByText("Contact messages").first().click();
  await page.waitForTimeout(3500);
  await page.getByText("Question about ID cards").first().waitFor({ timeout: 30000 });
  await shot("inbox", page.getByText("Question about ID cards").first(), { pad: 200 });
});
await step("inbox_open", async () => {
  await page.getByText("Question about ID cards").first().click();
  await page.waitForTimeout(3500);
  await shot("inbox_open", null);
});
await step("payments_summary", async () => {
  await go("/admin/platform-payments");
  const c = card("Paid in by each organization, all time");
  await bring(c);
  await shot("payments_summary", c, { pad: 8 });
});
await step("payments_review", async () => {
  const c = card("Withdrawals waiting for approval");
  await bring(c);
  await shot("payments_review", c, { pad: 8 });
});
await step("platform_fund", async () => {
  await go("/admin/platform-fund");
  await shot("platform_fund", page.getByText("Money in and out", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"), { pad: 8 });
});
await step("maintenance", async () => {
  await go("/admin/maintenance");
  await shot("maintenance", page.getByText("Maintenance mode", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"), { pad: 8 });
});
await step("maintenance_where", async () => {
  const c = page.getByText("Where it shows", { exact: true }).first();
  await bring(c);
  await shot("maintenance_where", c.locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"), { pad: 8 });
});
await step("backups", async () => {
  await go("/admin/backups");
  await shot("backups", page.getByText("Backup history", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"), { pad: 8 });
});
await step("audit", async () => {
  await go("/admin/audit", 8000);
  await shot("audit", page.getByPlaceholder("Search the log"), { pad: 14 });
});
await step("audit_rows", async () => {
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(1500);
  await shot("audit_rows", null);
});

writeFileSync(path.join(out, "steps.json"), JSON.stringify({ focus }, null, 2));
await browser.close();
