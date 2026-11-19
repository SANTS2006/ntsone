// Records the contributions and wish list screens of the demo app. Demo data is prepared through the demo API (payments for the contributors,
// one amount taken out), then the tabs are shown; on the wish list one item is marked "gotten" through the screen and a share link is only opened,
// not sent. Output: pipeline/out/video_groups/steps/<id>.png and steps.json
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../pipeline/out/video_groups/steps");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const WEB = "http://localhost:5188";
const API = "http://localhost:4000/api";

const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bootcamp.admin@example.com", password: "ProgramAdmin123!" }) })).json();
const h = { Authorization: `Bearer ${login.data.accessToken}`, "Content-Type": "application/json" };
const get = async (p) => (await (await fetch(`${API}${p}`, { headers: h })).json()).data;
const pick = (d) => (d.items ?? d)[0];
const contribution = pick(await get("/contributions"));
const wish = pick(await get("/wishlists"));

// ---- prepare the contribution's demo data (demo database only)
const detail = await get(`/contributions/${contribution.id}`);
const fields = detail.fields ?? [];
const nameField = fields.find((f) => /name/i.test(f.label)) ?? fields[0];
const phoneField = fields.find((f) => /phone/i.test(f.label));
let recs = (await get(`/contributions/${contribution.id}/records`));
recs = recs.items ?? recs;
if (recs.length === 0) {
  for (const [n, ph] of [["Aminata Kamara", "076 000001"], ["Joseph Conteh", "076 000002"], ["Mariatu Sesay", "076 000003"]]) {
    const r = await fetch(`${API}/contributions/${contribution.id}/records`, { method: "POST", headers: h, body: JSON.stringify({ values: { [nameField.id]: n, ...(phoneField ? { [phoneField.id]: ph } : {}) } }) });
    if (!r.ok) console.log("record failed", r.status, (await r.text()).slice(0, 160));
  }
  recs = (await get(`/contributions/${contribution.id}/records`));
  recs = recs.items ?? recs;
}
const now = new Date();
const y = now.getFullYear(), m = now.getMonth() + 1;
const startM = Math.max(1, m - 1);
for (const [i, r] of recs.entries()) {
  for (let month = startM; month <= m; month++) {
    if (i === 2 && month === m) continue; // one contributor has not paid this month yet
    const r2 = await fetch(`${API}/contributions/${contribution.id}/records/${r.id}/payments`, { method: "PUT", headers: h, body: JSON.stringify({ year: y, month, amountMinor: 20000 }) });
    if (!r2.ok) console.log("payment failed", r2.status, (await r2.text()).slice(0, 160));
  }
}
console.log("records", recs.length);

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
const go = async (route, wait = 5500) => {
  await page.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(wait);
};
const tab = async (name) => {
  await page.getByText(name, { exact: true }).first().click();
  await page.waitForTimeout(3500);
};

await go("/login", 2500);
await page.fill('input[type="email"]', "bootcamp.admin@example.com");
await page.fill('input[type="password"]', "ProgramAdmin123!");
await page.click('button[type="submit"]');
await page.waitForURL("**/admin**");
await page.waitForTimeout(4000);

// ---------------------------------------------------------------- contributions
await step("c_list", async () => {
  await go("/admin/contributions");
  await shot("c_list", page.getByRole("button", { name: "New contribution" }), { pad: 14 });
});
await step("c_new", async () => {
  await page.getByRole("button", { name: "New contribution" }).click();
  await page.waitForTimeout(1500);
  await shot("c_new", page.getByRole("dialog"), { pad: 0 });
  await page.keyboard.press("Escape");
});
await step("c_overview", async () => {
  await go(`/admin/contributions/${contribution.id}`);
  await shot("c_overview", page.getByRole("heading", { level: 1 }), { pad: 30 });
});
await step("c_tracker", async () => {
  await tab("Monthly tracker");
  await shot("c_tracker", null);
});
await step("c_contributors", async () => {
  await tab("Contributors");
  await shot("c_contributors", null);
});
await step("c_taken", async () => {
  await tab("Money taken");
  await shot("c_taken", null);
});
await step("c_history", async () => {
  await tab("History");
  await shot("c_history", null);
});

// ---------------------------------------------------------------- wish lists
await step("w_list", async () => {
  await go("/admin/wishlists");
  await shot("w_list", page.getByRole("button", { name: "New wish list" }), { pad: 14 });
});
await step("w_items", async () => {
  await go(`/admin/wishlists/${wish.id}`);
  await shot("w_items", page.getByRole("button", { name: "Add items" }), { pad: 14 });
});
await step("w_add", async () => {
  await page.getByRole("button", { name: "Add items" }).click();
  await page.waitForTimeout(1500);
  await shot("w_add", page.getByRole("dialog"), { pad: 0 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
});
await step("w_got", async () => {
  await page.getByRole("button", { name: "Got it" }).first().click();
  await page.waitForTimeout(1500);
  await shot("w_got", page.getByRole("dialog"), { pad: 0 });
});
await step("w_gotten", async () => {
  const d = page.getByRole("dialog");
  const price = d.locator("input").first();
  await price.fill("600").catch(() => {});
  await d.getByRole("button", { name: /got it|save|mark/i }).last().click();
  await page.waitForTimeout(3500);
  await page.getByRole("link", { name: /^Gotten/ }).click();
  await page.waitForTimeout(4500);
  await shot("w_gotten", null);
});
await step("w_summary", async () => {
  await page.getByRole("link", { name: "Summary" }).click();
  await page.waitForTimeout(5000);
  await shot("w_summary", null);
});
await step("w_activity", async () => {
  await page.getByRole("link", { name: "Activity" }).click();
  await page.waitForTimeout(4500);
  await shot("w_activity", null);
});
await step("w_sharing", async () => {
  await page.getByRole("link", { name: "Sharing" }).click();
  await page.waitForTimeout(4500);
  await shot("w_sharing", null);
});

writeFileSync(path.join(out, "steps.json"), JSON.stringify({ focus }, null, 2));
await browser.close();
