// Performs the registration workflow in the real app (demo database) and saves one highlighted 1920x1080 screenshot per step:
// create a program, build and publish its form, fill it in as a registrant, then manage the registration.
// Output: pipeline/out/video_registrations/steps/<id>.png and steps.json (focus point of each highlight).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../pipeline/out/video_registrations/steps");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const WEB = "http://localhost:5188";
const API = "http://localhost:4000/api";
const NAME = "Youth Leadership Summit 2027";

// start clean: remove an earlier take of the demo program (demo database only)
const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bootcamp.admin@example.com", password: "ProgramAdmin123!" }) })).json();
const auth = { Authorization: `Bearer ${login.data.accessToken}`, "Content-Type": "application/json" };
const existing = (await (await fetch(`${API}/programs?page=1&pageSize=50`, { headers: auth })).json()).data.items.filter((p) => p.name === NAME);
for (const p of existing) await fetch(`${API}/programs/${p.id}`, { method: "DELETE", headers: auth, body: "{}" });

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--disable-dev-shm-usage"] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "light", deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
const focus = {};

/** Draws a blue outline around the element(s), saves the screenshot and remembers where to zoom. */
async function shot(id, target = null, { full = false, pad = 10 } = {}) {
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
  await page.screenshot({ path: path.join(out, `${id}.png`), fullPage: full });
  await page.evaluate(() => document.querySelectorAll(".__hl").forEach((n) => n.remove()));
  focus[id] = point;
  console.log("shot", id);
}
const step = async (id, fn) => {
  try {
    await fn();
  } catch (e) {
    console.log("STEP FAILED", id, e.message.split("\n")[0].slice(0, 160));
    await page.screenshot({ path: path.join(out, `${id}.failed.png`) }).catch(() => {});
  }
};
const go = async (route) => {
  await page.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
};

// ---- sign in
await go("/login");
await page.fill('input[type="email"]', "bootcamp.admin@example.com");
await page.fill('input[type="password"]', "ProgramAdmin123!");
await page.click('button[type="submit"]');
await page.waitForURL("**/admin**");

// ---- 1. create the program
await step("create_list", async () => {
  await go("/admin/programs");
  await shot("create_list", page.getByRole("button", { name: "New Program" }));
});
await step("create_dialog", async () => {
  await page.getByRole("button", { name: "New Program" }).click();
  await page.waitForTimeout(800);
  await page.locator('input[name="name"]').fill(NAME);
  await page.getByPlaceholder("Shown on cards and listings").fill("A three-day summit for young leaders");
  await page.locator('textarea[name="description"]').fill("Workshops, talks and networking for young leaders from across the country.");
  await shot("create_dialog", page.getByRole("button", { name: "Create program" }));
});
let programId = "";
await step("create_done", async () => {
  await page.getByRole("button", { name: "Create program" }).click();
  await page.waitForURL(/\/admin\/programs\/[0-9a-f-]{36}$/);
  programId = page.url().split("/").pop();
  await page.waitForTimeout(1500);
  await shot("create_done", page.getByRole("link", { name: "Form Builder" }));
});

// ---- 2. build the form
await step("form_open", async () => {
  await page.getByRole("link", { name: "Form Builder" }).click();
  await page.waitForURL(/\/form$/);
  await page.waitForTimeout(3000);
  await page.locator('input').first().waitFor();
  await shot("form_open", page.getByText("Choose a field type to add"));
});
const addField = async (type, label, { required = false } = {}) => {
  await page.getByText("Choose a field type to add").or(page.locator('[role="combobox"]').last()).first().click();
  await page.getByRole("option", { name: type, exact: true }).click();
  await page.getByRole("button", { name: "Add field" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("dialog").locator("input").first().fill(label);
  if (required) await page.locator("#required").click();
};
await step("field_dialog", async () => {
  await addField("Short Text", "Full name", { required: true });
  await shot("field_dialog", page.getByRole("dialog"), { pad: 0 });
  await page.getByRole("button", { name: "Save field" }).click();
  await page.waitForTimeout(700);
});
await step("field_more", async () => {
  await addField("Email", "Email address", { required: true });
  await page.getByRole("button", { name: "Save field" }).click();
  await page.waitForTimeout(500);
  await addField("Phone Number", "Phone number");
  await page.getByRole("button", { name: "Save field" }).click();
  await page.waitForTimeout(500);
  await addField("Date of Birth", "Date of birth");
  await page.getByRole("button", { name: "Save field" }).click();
  await page.waitForTimeout(500);
  await addField("Yes / No", "Will you attend the networking dinner?");
  await page.getByRole("button", { name: "Save field" }).click();
  await page.waitForTimeout(800);
  await shot("field_more", page.getByRole("button", { name: "Edit field" }).first(), { pad: 6 });
});
await step("form_preview", async () => {
  await page.getByRole("button", { name: "Preview" }).click();
  await page.waitForTimeout(1500);
  await shot("form_preview", page.getByRole("dialog"), { pad: 0 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
});
await step("form_publish", async () => {
  await page.getByRole("button", { name: "Save Draft" }).click();
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.waitForTimeout(4000);
  await shot("form_publish", page.getByRole("button", { name: /Publish|Published|Unpublish/ }));
});

// ---- 3. publish the program, share
let slug = "";
await step("program_publish", async () => {
  await go(`/admin/programs/${programId}`);
  await page.getByRole("button", { name: "Publish program" }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /^(Open|Reopen) registration$/ }).click();
  await page.waitForTimeout(2500);
  const detail = await (await fetch(`${API}/programs/${programId}`, { headers: auth })).json();
  slug = detail.data.slug;
  await shot("program_publish", page.getByRole("button", { name: /Close registration/ }));
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`${API}/public/programs/${slug}/form`);
    if (r.ok) break;
    await page.waitForTimeout(2500);
  }
});

// ---- 4. the registrant's side
await step("public_open", async () => {
  await go(`/programs/${slug}/register`);
  await shot("public_open", null);
});
await step("public_errors", async () => {
  await page.getByRole("button", { name: /review your answers|submit|register/i }).last().click();
  await page.waitForTimeout(900);
  await shot("public_errors", page.locator('[data-invalid="true"]'), { pad: 12 });
});
await step("public_filled", async () => {
  await page.getByLabel(/Full name/).fill("Aminata Kamara");
  await page.getByLabel(/Email address/).fill("aminata.kamara@example.com");
  await page.getByLabel(/Phone number/).fill("076 123456");
  await page.getByLabel(/Date of birth/).fill("2001-05-14");
  await page.getByText("Yes", { exact: true }).first().click().catch(() => {});
  await page.getByLabel(/Phone number/).blur();
  await shot("public_filled", page.getByLabel(/Email address/), { pad: 10 });
});
await step("public_submit", async () => {
  const consent = page.locator("#review-confirm");
  if (await consent.count()) await consent.click();
  await page.getByRole("button", { name: /review your answers|submit|register/i }).last().click();
  await page.waitForURL("**/confirmation", { timeout: 40000 });
  await page.waitForTimeout(3500);
  await shot("public_done", null);
});

// ---- 5. manage registrations
await step("regs_list", async () => {
  await go(`/admin/programs/${programId}/registrations`);
  await page.getByText("Aminata Kamara").first().waitFor({ timeout: 25000 });
  await shot("regs_list", page.getByPlaceholder(/search/i));
});
await step("regs_detail", async () => {
  await page.getByText("Aminata Kamara").first().click();
  await page.waitForTimeout(3000);
  await shot("regs_detail", null);
});
await step("status_change", async () => {
  await page.getByText("Choose new status").click();
  await page.waitForTimeout(600);
  await shot("status_options", page.getByRole("listbox"), { pad: 8 });
  await page.getByRole("option", { name: /approved/i }).first().click();
  await page.locator("textarea").first().fill("Welcome to the summit!");
  await shot("status_ready", page.getByRole("button", { name: "Update status" }));
  await page.getByRole("button", { name: "Update status" }).click();
  await page.waitForTimeout(3500);
  await shot("status_done", page.getByText("History").first(), { pad: 14 });
});
await step("verifications", async () => {
  await go(`/admin/programs/${programId}/verifications`);
  await shot("verifications", null);
});
await step("idcard_settings", async () => {
  await go(`/admin/programs/${programId}`);
  await page.waitForTimeout(6000);
  const heading = page.getByText(/^ID cards?$/i).first();
  await heading.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1500);
  await shot("idcard_settings", heading, { pad: 14 });
});

writeFileSync(path.join(out, "steps.json"), JSON.stringify({ programId, slug, focus }, null, 2));
await browser.close();
