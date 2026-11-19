// Performs the bookkeeping workflow in the real app (demo database): write sales, spending, credit and a loan into a business's
// cash book, then show the entries, loans and reports. One highlighted screenshot per step.
// Output: pipeline/out/video_books/steps/<id>.png and steps.json
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../pipeline/out/video_books/steps");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const WEB = "http://localhost:5188";
const API = "http://localhost:4000/api";
const NAME = "Kamara General Store";

const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bootcamp.admin@example.com", password: "ProgramAdmin123!" }) })).json();
const auth = { Authorization: `Bearer ${login.data.accessToken}`, "Content-Type": "application/json" };
for (const b of (await (await fetch(`${API}/businesses?page=1&pageSize=50`, { headers: auth })).json()).data.items.filter((b) => b.name === NAME)) {
  await fetch(`${API}/businesses/${b.id}`, { method: "DELETE", headers: auth, body: "{}" }).catch(() => {});
}
const created = await (await fetch(`${API}/businesses`, { method: "POST", headers: auth, body: JSON.stringify({ name: NAME, description: "A general store selling everyday goods.", email: "kamara@store.example.com", phone: "076 400 500", address: "5 Bai Bureh Road, Freetown" }) })).json();
const bizId = created.data.id;

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
const go = async (route, wait = 4500) => {
  await page.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(wait);
};
const card = (text) => page.getByText(text, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl') or contains(@class,'rounded-2xl')][1]");
const bring = async (loc) => {
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(1200);
};

await go("/login", 2500);
await page.fill('input[type="email"]', "bootcamp.admin@example.com");
await page.fill('input[type="password"]', "ProgramAdmin123!");
await page.click('button[type="submit"]');
await page.waitForURL("**/admin**");

/** Opens a big button, fills the common boxes and writes the entry. */
async function writeEntry({ button, amount, credit = false, party, note, shotId }) {
  await page.getByText(button, { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByPlaceholder("0.00").first().fill(amount);
  if (credit) await page.getByText("On credit", { exact: true }).first().click();
  if (party) {
    const who = page.getByRole("dialog").getByText(/Who (got the loan|bought it|did you|paid)/).first().locator("xpath=following::input[1]");
    if (await who.count()) await who.fill(party);
    else await page.locator("#book-party").fill(party).catch(() => {});
  }
  if (note) {
    const what = page.getByRole("dialog").getByText(/What was it for\?/).first().locator("xpath=following::input[1]");
    if (await what.count()) await what.fill(note).catch(() => {});
  }
  if (shotId) await shot(shotId, page.getByRole("dialog"), { pad: 0 });
  await page.getByRole("button", { name: "Write it in the book" }).click();
  await page.waitForTimeout(3500);
}

await step("books_home", async () => {
  await go(`/admin/businesses/${bizId}/books`);
  await shot("books_home", page.getByText("What happened?").first().locator("xpath=following::div[1]"), { pad: 20 });
});
await step("entry_dialog", async () => {
  await writeEntry({ button: "I sold something", amount: "150", party: "Hillside Primary School", note: "20 exercise books", shotId: "entry_dialog" });
});
await step("entries_more", async () => {
  await writeEntry({ button: "I sold something", amount: "90", credit: true, party: "Mr. Kargbo", note: "Rice and cooking oil", shotId: "entry_credit" });
  await writeEntry({ button: "I spent money", amount: "40", note: "Transport for deliveries" });
  await writeEntry({ button: "I bought stock", amount: "120", note: "Soap and sugar" });
});
await step("books_summary", async () => {
  await go(`/admin/businesses/${bizId}/books`);
  await shot("books_summary", page.getByText(/Profit in/i).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]"), { pad: 12 });
});
await step("entries_list", async () => {
  await page.getByRole("link", { name: "All entries" }).click();
  await page.waitForTimeout(5000);
  await shot("entries_list", null);
});
await step("loan_form", async () => {
  await go(`/admin/businesses/${bizId}/books`);
  await writeEntry({ button: "I lent money", amount: "50", party: "Fatmata Koroma", note: "Help to buy stock", shotId: "loan_dialog" });
});
await step("loans", async () => {
  await page.getByRole("link", { name: "Loans" }).click();
  await page.waitForTimeout(5000);
  await shot("loans", null);
});
await step("reports", async () => {
  await page.getByRole("link", { name: "Reports" }).click();
  await page.waitForTimeout(6000);
  await shot("reports", null);
});
await step("reports_cash", async () => {
  await page.getByText("Cash flow", { exact: true }).first().click();
  await page.waitForTimeout(3500);
  await shot("reports_cash", page.getByText("Cash flow", { exact: true }).first(), { pad: 14 });
});
await step("reports_owe", async () => {
  await page.getByText("Who owes what", { exact: true }).first().click();
  await page.waitForTimeout(3500);
  await shot("reports_owe", page.getByText("Who owes what", { exact: true }).first(), { pad: 14 });
});
await step("reports_more", async () => {
  await page.evaluate(() => window.scrollBy(0, 700));
  await page.waitForTimeout(1500);
  await shot("reports_more", null);
});
await step("voice", async () => {
  await page.getByRole("link", { name: "Voice notes" }).click();
  await page.waitForTimeout(5000);
  await shot("voice", null);
});

writeFileSync(path.join(out, "steps.json"), JSON.stringify({ bizId, focus }, null, 2));
await browser.close();
