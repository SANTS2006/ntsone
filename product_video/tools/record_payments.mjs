// Records the payment screens of the demo app: turning payments on for a program (with the fee agreement), the program's payments,
// the payment fund (balances, all-time totals, accounts, automatic withdrawal, withdrawals, ledger) and the platform team's views.
// The demo database holds FICTITIOUS payment history (tools/seed_demo_payments.mjs); no real payment is made.
// Output: pipeline/out/video_payments/steps/<id>.png and steps.json
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../pipeline/out/video_payments/steps");
const ONLY = process.env.ONLY;
if (!ONLY) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const WEB = "http://localhost:5188";
const API = "http://localhost:4000/api";

const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bootcamp.admin@example.com", password: "ProgramAdmin123!" }) })).json();
const auth = { Authorization: `Bearer ${login.data.accessToken}` };
const programs = (await (await fetch(`${API}/programs?page=1&pageSize=50`, { headers: auth })).json()).data.items;
const program = programs.find((p) => p.name === "Web Development Bootcamp");
const tenantId = login.data.user.tenantId;

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--disable-dev-shm-usage"] });
const newCtx = () => browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "light", deviceScaleFactor: 1 });
import { readFileSync, existsSync } from "node:fs";
const focus = ONLY && existsSync(path.join(out, "steps.json")) ? JSON.parse(readFileSync(path.join(out, "steps.json"), "utf8")).focus : {};

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
const go = async (p, route, wait = 4000) => {
  await p.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(wait);
};
const card = (p, text) => p.getByText(text, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
const bring = async (p, loc) => {
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await p.waitForTimeout(1500);
};
const signIn = async (p, email, password) => {
  await p.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
  await go(p, "/login", 2500);
  await p.fill('input[type="email"]', email);
  await p.fill('input[type="password"]', password);
  await p.click('button[type="submit"]');
  await p.waitForURL("**/admin**");
};

if (!ONLY || ONLY === "org") {
// ---------------------------------------------------------------- the organization admin
// start from "payments off" so the video can show turning them on (demo database only)
await fetch(`${API}/programs/${program.id}/payment-config`, {
  method: "PUT",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ enabled: false, registrationFeeMinor: 0, idCardPriceMinor: 0, ticketPriceMinor: 0, allowPayInPerson: true }),
}).then((r) => console.log("reset payments:", r.status));
const adminCtx = await newCtx();
const page = await adminCtx.newPage();
await signIn(page, "bootcamp.admin@example.com", "ProgramAdmin123!");

await step(page, "pay_card", async () => {
  await go(page, `/admin/programs/${program.id}`);
  const c = card(page, "Take payments");
  await bring(page, c);
  await shot(page, "pay_card", c, { pad: 8 });
});
await step(page, "pay_prices", async () => {
  await page.locator(`#pay-${program.id}`).click();
  await page.waitForTimeout(900);
  await page.getByPlaceholder("0 (free)").first().fill("20");
  await shot(page, "pay_prices", page.getByPlaceholder("0 (free)").first(), { pad: 60 });
});
await step(page, "pay_fee", async () => {
  const box = page.locator(`#fee-${program.id}`).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  const check = page.locator(`#fee-${program.id}`);
  await box.scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Save payment settings" }).click();
  await page.waitForTimeout(1200);
  await shot(page, "pay_fee_error", box, { pad: 14 });
  await check.click();
  await shot(page, "pay_fee", box, { pad: 14 });
});
await step(page, "pay_saved", async () => {
  await page.getByRole("button", { name: "Save payment settings" }).click();
  await page.waitForTimeout(3500);
  await shot(page, "pay_saved", page.locator(`#fee-${program.id}`).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]"), { pad: 14 });
});
await step(page, "prog_payments", async () => {
  await go(page, `/admin/programs/${program.id}/payments`);
  await page.getByText(/Demo Registrant/).first().waitFor({ timeout: 30000 });
  await shot(page, "prog_payments", page.getByText(/Demo Registrant/).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"), { pad: 8 });
});

await step(page, "fund_top", async () => {
  await go(page, "/admin/funds", 6000);
  await shot(page, "fund_top", page.getByText("Available").first().locator("xpath=ancestor::div[contains(@class,'grid')][1]"), { pad: 10 });
});
await step(page, "fund_totals", async () => {
  await shot(page, "fund_totals", page.getByText("Total received, all time").first().locator("xpath=ancestor::div[contains(@class,'grid')][1]"), { pad: 10 });
});
await step(page, "fund_auto", async () => {
  const c = page.getByText("Automatic withdrawal").first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await bring(page, c);
  await shot(page, "fund_auto", c, { pad: 8 });
});
await step(page, "fund_accounts", async () => {
  const c = page.getByText("Withdrawal accounts", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await bring(page, c);
  await shot(page, "fund_accounts", c, { pad: 8 });
});
await step(page, "withdraw_dialog", async () => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await page.waitForTimeout(1500);
  await shot(page, "withdraw_dialog", page.getByRole("dialog"), { pad: 0 });
  await page.keyboard.press("Escape");
});
await step(page, "add_account", async () => {
  await page.getByRole("button", { name: "Add account" }).click();
  await page.waitForTimeout(1500);
  await shot(page, "add_account", page.getByRole("dialog"), { pad: 0 });
  await page.keyboard.press("Escape");
});
await step(page, "fund_withdrawals", async () => {
  const c = page.getByText("Withdrawals", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await bring(page, c);
  await shot(page, "fund_withdrawals", c, { pad: 8 });
});
await step(page, "fund_ledger", async () => {
  const c = page.getByText("Money in and out", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await bring(page, c);
  await shot(page, "fund_ledger", c, { pad: 8 });
});

}
if (!ONLY || ONLY === "platform") {
// ---------------------------------------------------------------- the platform team
const superCtx = await newCtx();
const sp = await superCtx.newPage();
await signIn(sp, "admin@example.com", "SuperAdmin123!");
await step(sp, "platform_summary", async () => {
  await go(sp, "/admin/platform-payments", 6000);
  const c = sp.getByText("Paid in by each organization, all time").first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await bring(sp, c);
  await shot(sp, "platform_summary", c, { pad: 8 });
});
await step(sp, "platform_terms", async () => {
  await go(sp, `/admin/tenants/${tenantId}`, 5000);
  const c = sp.getByText("Payment terms", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await bring(sp, c);
  await shot(sp, "platform_terms", c, { pad: 8 });
});

}
writeFileSync(path.join(out, "steps.json"), JSON.stringify({ focus }, null, 2));
await browser.close();
