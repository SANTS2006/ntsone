// Performs the voting workflow in the real app (demo database): create a poll without voter accounts, build the ballot,
// open voting, vote as a visitor, then see the results and voters. One highlighted screenshot per step.
// Output: pipeline/out/video_voting/steps/<id>.png and steps.json
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../pipeline/out/video_voting/steps");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const WEB = "http://localhost:5188";
const API = "http://localhost:4000/api";
const NAME = "Campus Quick Poll";

const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bootcamp.admin@example.com", password: "ProgramAdmin123!" }) })).json();
const auth = { Authorization: `Bearer ${login.data.accessToken}`, "Content-Type": "application/json" };
const polls = (await (await fetch(`${API}/polls?page=1&pageSize=50`, { headers: auth })).json()).data.items;
for (const p of polls.filter((p) => p.name === NAME)) await fetch(`${API}/polls/${p.id}`, { method: "DELETE", headers: auth, body: "{}" });
const accountPoll = polls.find((p) => p.name === "Student Council Elections 2026");

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
    console.log("STEP FAILED", id, e.message.split("\n")[0].slice(0, 160));
    await p.screenshot({ path: path.join(out, `${id}.failed.png`) }).catch(() => {});
  }
};
const go = async (p, route) => {
  await p.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
};

await go(page, "/login");
await page.fill('input[type="email"]', "bootcamp.admin@example.com");
await page.fill('input[type="password"]', "ProgramAdmin123!");
await page.click('button[type="submit"]');
await page.waitForURL("**/admin**");

let pollId = "";
let slug = "";
await step(page, "polls_list", async () => {
  await go(page, "/admin/polls");
  await shot(page, "polls_list", page.getByRole("button", { name: "New Poll" }));
});
await step(page, "create_dialog", async () => {
  await page.getByRole("button", { name: "New Poll" }).click();
  await page.waitForTimeout(800);
  await page.getByPlaceholder("e.g. Student Union Elections 2026").fill(NAME);
  await page.locator("#poll-description").fill("A quick vote for the new campus notice board.");
  await page.getByText("No, anyone with the link can vote").click();
  await shot(page, "create_dialog", page.getByText("Do voters need an account to vote?"), { pad: 380 });
});
await step(page, "ballot_empty", async () => {
  await page.getByRole("button", { name: "Create poll" }).click();
  await page.waitForURL(/ballot/, { timeout: 30000 });
  pollId = page.url().split("/").slice(-2, -1)[0];
  await page.waitForTimeout(2500);
  await shot(page, "ballot_empty", page.getByRole("button", { name: "Add the first position" }));
});
await step(page, "ballot_filled", async () => {
  await page.getByRole("button", { name: "Add the first position" }).click().catch(() => page.getByRole("button", { name: "Add position" }).first().click());
  await page.waitForTimeout(700);
  await page.getByPlaceholder("e.g. President").fill("Notice board design");
  await page.getByLabel("Candidate 1 name").fill("Blue and white");
  await page.getByLabel("Candidate 2 name").fill("Green and gold");
  await page.getByRole("button", { name: "Add candidate" }).click();
  await page.getByLabel("Candidate 3 name").fill("Black and orange");
  await shot(page, "ballot_filled", page.getByLabel("Candidate 1 name"), { pad: 40 });
});
await step(page, "ballot_saved", async () => {
  await page.getByRole("button", { name: "Save ballot" }).first().click();
  await page.waitForTimeout(3500);
  await shot(page, "ballot_saved", page.getByRole("button", { name: "Save ballot" }).first());
});
await step(page, "settings", async () => {
  await go(page, `/admin/polls/${pollId}`);
  const sw = page.getByText("Voters must create an account");
  await sw.scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, "settings", sw, { pad: 250 });
});
await step(page, "open_voting", async () => {
  await page.getByRole("button", { name: "Open voting" }).click();
  await page.waitForTimeout(4000);
  slug = (await (await fetch(`${API}/polls/${pollId}`, { headers: auth })).json()).data.slug;
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "open_voting", page.getByText(/Voting open/i));
});
await step(page, "paid_card", async () => {
  const c = page.getByText("Voters pay for their votes");
  await c.scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, "paid_card", c, { pad: 350 });
});

// ---- the voter's side, with no sign-up
const voter = await newCtx();
const vp = await voter.newPage();
await vp.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
await step(vp, "vote_open", async () => {
  await vp.goto(`${WEB}/vote/${slug}`, { waitUntil: "domcontentloaded" });
  await vp.getByText("Blue and white").first().waitFor({ timeout: 40000 });
  await vp.waitForTimeout(1500);
  await shot(vp, "vote_open", null);
});
await step(vp, "vote_selected", async () => {
  await vp.getByText("Green and gold").first().click();
  await shot(vp, "vote_selected", vp.getByText("Green and gold").first(), { pad: 150 });
});
await step(vp, "vote_done", async () => {
  await vp.getByRole("button", { name: /vote|submit|next|finish/i }).last().click();
  await vp.waitForTimeout(5000);
  await shot(vp, "vote_done", null);
});

// ---- a poll that asks for accounts
await step(vp, "account_login", async () => {
  await vp.goto(`${WEB}/vote/${accountPoll.slug}`, { waitUntil: "domcontentloaded" });
  await vp.waitForURL(/login/, { timeout: 30000 });
  await vp.waitForTimeout(2500);
  await shot(vp, "account_login", vp.getByRole("link", { name: /create one|sign up|register/i }), { pad: 160 });
});

// ---- results and voters
await step(page, "results", async () => {
  await go(page, `/admin/polls/${pollId}/results`);
  await page.getByText("Green and gold").first().waitFor({ timeout: 30000 });
  await shot(page, "results", page.getByText("Green and gold").first(), { pad: 280 });
});
await step(page, "voters", async () => {
  await go(page, `/admin/polls/${pollId}/voters`);
  const guest = page.getByText("Guest (no account)").first();
  await guest.waitFor({ timeout: 40000 });
  await shot(page, "voters", guest, { pad: 200 });
});

writeFileSync(path.join(out, "steps.json"), JSON.stringify({ pollId, slug, focus }, null, 2));
await browser.close();
