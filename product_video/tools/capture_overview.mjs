// Records the real NTSOne app (demo database, localhost:5188) scene by scene at 1920x1080 and cuts each scene
// to the length of its narration. Output: product_video/build/out/video1_overview/<scene>.screen.mp4
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../build/out/video1_overview");
const WEB = "http://localhost:5188";
const API = "http://localhost:4000/api";
const FFMPEG = spawnSync("python", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).stdout.toString().trim();

const wavSeconds = (id) => {
  const b = readFileSync(path.join(out, `${id}.wav`));
  return b.readUInt32LE(40) / b.readUInt32LE(28); // data bytes / byte rate
};

// ids of the demo content
const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bootcamp.admin@example.com", password: "ProgramAdmin123!" }) })).json();
const auth = { Authorization: `Bearer ${login.data.accessToken}` };
const get = async (p) => (await (await fetch(`${API}${p}`, { headers: auth })).json()).data;
const programs = (await get("/programs?page=1&pageSize=20")).items;
const polls = (await get("/polls?page=1&pageSize=20")).items;
const businesses = (await get("/businesses?page=1&pageSize=20")).items;
const wishlists = await get("/wishlists");
const contributions = await get("/contributions");
const program = programs.find((p) => p.status === "published") ?? programs[0];
const poll = polls[0], business = businesses[0];
const wish = (wishlists.items ?? wishlists)[0], contribution = (contributions.items ?? contributions)[0];

console.log("data ready");
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--disable-dev-shm-usage"] });
const base = { viewport: { width: 1920, height: 1080 }, colorScheme: "light", deviceScaleFactor: 1 };

// Sign in once and keep the session for every scene.
const loginCtx = await browser.newContext(base);
const lp = await loginCtx.newPage();
await lp.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
await lp.goto(`${WEB}/login`);
await lp.fill('input[type="email"]', "bootcamp.admin@example.com");
await lp.fill('input[type="password"]', "ProgramAdmin123!");
await lp.click('button[type="submit"]');
console.log("clicked sign in");
await lp.waitForURL("**/admin**");
console.log("signed in");
const state = await loginCtx.storageState();
await loginCtx.close();

const smoothScroll = async (page, pixels, ms) => {
  const steps = 30;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, pixels / steps);
    await page.waitForTimeout(ms / steps);
  }
};

// Each scene: a list of [path, seconds-weight, optional scroll]
const scenes = {
  workspace: [[`/admin`, 1, 500]],
  registrations: [[`/admin/programs`, 1, 0], [`/admin/programs/${program.id}/form`, 1.4, 600], [`/admin/programs/${program.id}/registrations`, 1, 0]],
  voting: [[`/admin/polls/${poll.id}/ballot`, 1, 0], [`/admin/polls/${poll.id}/results`, 1, 0]],
  businesses: [[`/admin/businesses`, 1, 0], [`/admin/businesses/${business.id}`, 1.4, 500]],
  payments: [[`/admin/funds`, 1, 700]],
  books: [[`/admin/contributions/${contribution.id}`, 1, 0], [`/admin/wishlists/${wish.id}`, 1, 0], [`/admin/businesses/${business.id}/books`, 1, 0]],
};

for (const [id, steps] of Object.entries(scenes).filter(([k]) => !process.env.ONLY || k === process.env.ONLY)) {
  console.log("scene", id);
  const total = wavSeconds(id) + 0.6;
  const weight = steps.reduce((s, x) => s + x[1], 0);
  const ctx = await browser.newContext({ ...base, storageState: state });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
  // Real screen capture: the browser's own screencast frames, stamped with the time they were shown.
  await page.goto(`${WEB}${steps[0][0]}`, { waitUntil: "networkidle", timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const frames = [];
  let recording = false;
  let grabber = Promise.resolve();
  const startGrab = () => {
    recording = true;
    grabber = (async () => {
      while (recording) {
        const t = Date.now() / 1000;
        const data = await page.screenshot({ type: "jpeg", quality: 85, animations: "allow", timeout: 4000 }).catch(() => null);
        if (data) frames.push({ t, data });
        await new Promise((r) => setTimeout(r, 40));
      }
    })();
  };
  const stopGrab = async () => {
    recording = false;
    await grabber;
  };
  startGrab();
  for (const [index, [route, w, scroll]] of steps.entries()) {
    const ms = (total * 1000 * w) / weight;
    if (index > 0) {
      // Never navigate while a screenshot is in flight: it can crash the headless renderer.
      await stopGrab();
      await page.goto(`${WEB}${route}`, { waitUntil: "networkidle", timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(600);
      startGrab();
    }
    await page.waitForTimeout(800);
    const rest = Math.max(500, ms - 800);
    if (scroll) {
      await page.waitForTimeout(rest * 0.3);
      await smoothScroll(page, scroll, rest * 0.6);
      await page.waitForTimeout(rest * 0.1);
    } else await page.waitForTimeout(rest);
  }
  console.log("steps done, frames", frames.length);
  await stopGrab();
  await ctx.close();
  const dir = path.join(out, "_rec", id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const list = [];
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, "0")}.jpg`;
    writeFileSync(path.join(dir, name), f.data);
    const next = frames[i + 1]?.t ?? f.t + 0.5;
    list.push(`file '${name}'`, `duration ${Math.max(0.01, next - f.t).toFixed(4)}`);
  });
  list.push(`file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'`);
  writeFileSync(path.join(dir, "list.txt"), list.join(String.fromCharCode(10)));
  const target = path.join(out, `${id}.screen.mp4`);
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"), "-t", total.toFixed(2), "-vf", "fps=30,scale=1920:1080,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-an", target]);
  if (r.status !== 0) console.log(r.stderr.toString());
  console.log("recorded", id, total.toFixed(1) + "s");
}
await browser.close();
rmSync(path.join(out, "_rec"), { recursive: true, force: true });
