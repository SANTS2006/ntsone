// Records the team and security screens of the demo app: the Users page, inviting a teammate (demo address, the invitation email is not
// actually delivered), a person's access dialog and role menu (opened, nothing changed), a viewer's own sign-in view (their dashboard
// and the "Other organizations / Leave" card in Settings, not pressed) and a failed sign-in message. One highlighted screenshot per step.
// Output: pipeline/out/video_team/steps/<id>.png and steps.json
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../pipeline/out/video_team/steps");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const WEB = "http://localhost:5188";
const API = "http://localhost:4000/api";
const INVITE_EMAIL = "mariama.demo@example.com";

const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bootcamp.admin@example.com", password: "ProgramAdmin123!" }) })).json();
const auth = { Authorization: `Bearer ${login.data.accessToken}`, "Content-Type": "application/json" };
// start clean: remove an earlier take of the invited demo person
const team = (await (await fetch(`${API}/users?page=1&pageSize=50`, { headers: auth })).json()).data;
for (const u of team.items ?? team) if (u.email === INVITE_EMAIL) await fetch(`${API}/users/${u.id}`, { method: "DELETE", headers: auth, body: "{}" });

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
const go = async (p, route, wait = 5000) => {
  await p.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(wait);
};
const bring = async (loc, p) => {
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
  await p.waitForTimeout(5000);
};

// ---------------------------------------------------------------- the organization admin
const adminCtx = await newCtx();
const page = await adminCtx.newPage();
await signIn(page, "bootcamp.admin@example.com", "ProgramAdmin123!");

await step(page, "users_list", async () => {
  await go(page, "/admin/users");
  await shot(page, "users_list", page.getByRole("button", { name: /invite/i }).first(), { pad: 14 });
});
await step(page, "invite_dialog", async () => {
  await page.getByRole("button", { name: /invite/i }).first().click();
  await page.waitForTimeout(1000);
  const d = page.getByRole("dialog");
  await d.locator("input").first().fill("Mariama Demo");
  await d.locator('input[type="email"]').fill(INVITE_EMAIL);
  await shot(page, "invite_dialog", d, { pad: 0 });
});
await step(page, "invite_role", async () => {
  await shot(page, "invite_role", page.getByRole("dialog").locator("select").first(), { pad: 12 });
});
await step(page, "invite_sent", async () => {
  await page.getByRole("button", { name: "Send invitation" }).click();
  await page.waitForTimeout(5000);
  await shot(page, "invite_sent", page.getByText(INVITE_EMAIL).first(), { pad: 400 });
});
await step(page, "access_dialog", async () => {
  await page.getByRole("button", { name: /Manage access for Leadership Viewer/ }).click();
  await page.waitForTimeout(2500);
  await shot(page, "access_dialog", page.getByRole("dialog"), { pad: 0 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
});
await step(page, "role_menu", async () => {
  await shot(page, "role_menu", page.getByLabel(/Role of Leadership Viewer/).first(), { pad: 14 });
});

// ---------------------------------------------------------------- a viewer's own view
const viewerCtx = await newCtx();
const vp = await viewerCtx.newPage();
await signIn(vp, "viewer@example.com", "Viewer123!");
await step(vp, "viewer_dashboard", async () => {
  await shot(vp, "viewer_dashboard", vp.getByText("Start a space of your own").first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"), { pad: 8 });
});
await step(vp, "viewer_programs", async () => {
  await go(vp, "/admin/programs");
  await shot(vp, "viewer_programs", null);
});
await step(vp, "leave_org", async () => {
  await go(vp, "/admin/settings", 6000);
  const c = vp.getByText("Other organizations", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await bring(c, vp);
  await shot(vp, "leave_org", c, { pad: 8 });
});

// ---------------------------------------------------------------- sign-in protection
const visitor = await newCtx();
const gp = await visitor.newPage();
await gp.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
await step(gp, "login_error", async () => {
  await go(gp, "/login", 3500);
  await gp.fill('input[type="email"]', "nobody.here@example.com");
  await gp.fill('input[type="password"]', "not-the-password");
  await gp.click('button[type="submit"]');
  await gp.waitForTimeout(3500);
  await shot(gp, "login_error", gp.getByRole("alert").first(), { pad: 16 });
});
await step(page, "password_card", async () => {
  await go(page, "/admin/settings", 6000);
  const c = page.getByText("Change password", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await bring(c, page);
  await shot(page, "password_card", c, { pad: 8 });
});

writeFileSync(path.join(out, "steps.json"), JSON.stringify({ focus }, null, 2));
await browser.close();
