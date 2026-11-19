// Records the "getting started" screens of the demo app: the home page, creating an account (up to the emailed code), signing in,
// the dashboard and sidebar, dark mode, the profile menu, settings and the help pages. One highlighted screenshot per step.
// Output: pipeline/out/video_started/steps/<id>.png and steps.json
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../pipeline/out/video_started/steps");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const WEB = "http://localhost:5188";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--disable-dev-shm-usage"] });
const newCtx = () => browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "light", deviceScaleFactor: 1 });
const focus = {};

async function shot(p, id, target = null, { pad = 10 } = {}) {
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
  await p.screenshot({ path: path.join(out, `${id}.png`) });
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
const go = async (p, route, wait = 4500) => {
  await p.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(wait);
};
const bring = async (loc, p) => {
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await p.waitForTimeout(1500);
};

// ---------------------------------------------------------------- a visitor
const visitor = await newCtx();
const vp = await visitor.newPage();
await vp.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
await step(vp, "home_top", async () => {
  await go(vp, "/", 6000);
  await shot(vp, "home_top", vp.getByRole("link", { name: "Get started" }).first(), { pad: 12 });
});
await step(vp, "home_modules", async () => {
  const h = vp.getByText("Nine modules, one login").first();
  await bring(h, vp);
  await shot(vp, "home_modules", h, { pad: 30 });
});
await step(vp, "register_form", async () => {
  await go(vp, "/register", 4000);
  await vp.getByPlaceholder("Organization or account name").fill("Demo Learners Club");
  await vp.getByPlaceholder("Your full name").fill("Alhaji Demo");
  await vp.getByPlaceholder("Enter your email").fill(`learner.${Date.now()}@example.com`);
  await vp.getByPlaceholder("Password", { exact: true }).fill("Demo-Passw0rd-2027!");
  await vp.getByPlaceholder("Confirm password").fill("Demo-Passw0rd-2027!");
  await shot(vp, "register_form", vp.locator("form").first(), { pad: 12 });
});
await step(vp, "register_submit", async () => {
  await vp.locator('button#acceptTerms, button[id="acceptTerms"], [role="checkbox"]').first().click();
  await vp.waitForTimeout(500);
  await vp.getByRole("button", { name: "Create account" }).click();
  await vp.waitForURL(/verify-email/, { timeout: 40000 });
  await vp.waitForTimeout(3000);
  await shot(vp, "register_submit", null);
});
await step(vp, "login_page", async () => {
  await go(vp, "/login", 4000);
  await shot(vp, "login_page", vp.getByRole("button", { name: "Sign in" }), { pad: 24 });
});
await step(vp, "forgot_page", async () => {
  await go(vp, "/forgot-password", 3500);
  await shot(vp, "forgot_page", vp.getByRole("button", { name: "Send reset link" }), { pad: 24 });
});
await step(vp, "contact_page", async () => {
  await go(vp, "/contact", 4000);
  await shot(vp, "contact_page", null);
});

// ---------------------------------------------------------------- a signed-in admin
const adminCtx = await newCtx();
const page = await adminCtx.newPage();
await page.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
await go(page, "/login", 3000);
await page.fill('input[type="email"]', "bootcamp.admin@example.com");
await page.fill('input[type="password"]', "ProgramAdmin123!");
await page.click('button[type="submit"]');
await page.waitForURL("**/admin**");
await page.waitForTimeout(6000);
await step(page, "dash_top", async () => {
  await shot(page, "dash_top", page.getByText(/Welcome back/).first(), { pad: 40 });
});
await step(page, "dash_sidebar", async () => {
  await shot(page, "dash_sidebar", page.getByRole("link", { name: "Programs" }).first().locator("xpath=ancestor::nav[1]"), { pad: 8 });
});
await step(page, "dash_scroll", async () => {
  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(2000);
  await shot(page, "dash_scroll", null);
  await page.evaluate(() => window.scrollTo(0, 0));
});
await step(page, "dark_mode", async () => {
  const toggle = page.getByRole("button", { name: /Switch to dark mode/ }).first();
  await toggle.click();
  await page.waitForTimeout(1500);
  await shot(page, "dark_mode", page.getByRole("button", { name: /Switch to light mode/ }).first(), { pad: 14 });
  await page.getByRole("button", { name: /Switch to light mode/ }).first().click();
  await page.waitForTimeout(1200);
});
await step(page, "profile_menu", async () => {
  await page.getByRole("button", { name: "BC", exact: true }).first().click();
  await page.waitForTimeout(1200);
  await shot(page, "profile_menu", page.getByRole("menu").first(), { pad: 12 });
  await page.keyboard.press("Escape");
});
await step(page, "settings_profile", async () => {
  await go(page, "/admin/settings", 5000);
  await shot(page, "settings_profile", page.getByText("Settings", { exact: true }).first(), { pad: 40 });
});
await step(page, "settings_security", async () => {
  const c = page.getByText("Change password", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await bring(c, page);
  await shot(page, "settings_security", c, { pad: 8 });
});
await step(page, "settings_delete", async () => {
  const c = page.getByText("Delete account", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await bring(c, page);
  await shot(page, "settings_delete", c, { pad: 8 });
});

writeFileSync(path.join(out, "steps.json"), JSON.stringify({ focus }, null, 2));
await browser.close();
