// Captures real 1920x1080 screens of the NTSOne app (demo database) and turns each narration scene into a motion clip:
// slow zoom on a screen, or a scroll down a long page. Output: build/out/video1_overview/<scene>.screen.mp4
// (More robust than live screencasting, which crashed the headless browser on the dashboard's charts.)
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../pipeline/out/video1_overview");
const shots = path.join(out, "_shots");
mkdirSync(shots, { recursive: true });
const WEB = "http://localhost:5188";
const API = "http://localhost:4000/api";
const FFMPEG = spawnSync("python", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).stdout.toString().trim();
const wavSeconds = (id) =>
  Number(spawnSync("python", ["-c", "import wave,sys;w=wave.open(sys.argv[1]);print(w.getnframes()/w.getframerate())", path.join(out, `${id}.wav`)]).stdout.toString().trim());

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

// scene -> [route, weight, "zoom" | "scroll"]
const scenes = {
  workspace: [[`/admin`, 1, "scroll"]],
  registrations: [[`/admin/programs`, 1, "zoom"], [`/admin/programs/${program.id}/form`, 1.4, "scroll"], [`/admin/programs/${program.id}/registrations`, 1, "zoom"]],
  voting: [[`/admin/polls/${poll.id}/ballot`, 1, "zoom"], [`/admin/polls/${poll.id}/results`, 1, "zoom"]],
  businesses: [[`/admin/businesses`, 1, "zoom"], [`/admin/businesses/${business.id}`, 1.4, "scroll"]],
  payments: [[`/admin/funds`, 1, "scroll"]],
  books: [[`/admin/contributions/${contribution.id}`, 1, "zoom"], [`/admin/wishlists/${wish.id}`, 1, "zoom"], [`/admin/businesses/${business.id}/books`, 1, "zoom"]],
};

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--disable-dev-shm-usage"] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "light", deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem("ntsone-theme", "light"));
await page.goto(`${WEB}/login`);
await page.fill('input[type="email"]', "bootcamp.admin@example.com");
await page.fill('input[type="password"]', "ProgramAdmin123!");
await page.click('button[type="submit"]');
await page.waitForURL("**/admin**");

const run = (args) => {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
};

for (const [id, steps] of Object.entries(scenes).filter(([k]) => !process.env.ONLY || k === process.env.ONLY)) {
  const total = wavSeconds(id) + 0.6;
  const weight = steps.reduce((s, x) => s + x[1], 0);
  const clips = [];
  let i = 0;
  for (const [route, w, mode] of steps) {
    const dur = (total * w) / weight;
    await page.goto(`${WEB}${route}`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const png = path.join(shots, `${id}_${i}.png`);
    const full = mode === "scroll";
    await page.screenshot({ path: png, fullPage: full });
    const clip = path.join(shots, `${id}_${i}.mp4`);
    const frames = Math.round(dur * 30);
    let vf;
    if (full) {
      // Scroll down the page (or hold still if it fits the screen).
      vf = `scale=1920:-2,pad=1920:max(ih\\,1080):0:0:white,crop=1920:1080:0:'(ih-1080)*min(1,t/${(dur * 0.85).toFixed(2)})'`;
    } else {
      // Slow zoom in on the screen.
      vf = `scale=3840:2160,zoompan=z='1+0.06*on/${frames}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${frames}:s=1920x1080:fps=30`;
    }
    run(["-loop", "1", "-framerate", "30", "-i", png, "-t", dur.toFixed(2), "-vf", `${vf},format=yuv420p`, "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", clip]);
    clips.push(clip);
    i++;
  }
  const list = path.join(shots, `${id}.txt`);
  const listText = clips.map((c) => `file '${c.replace(/\\/g, "/")}'`).join(String.fromCharCode(10));
  (await import("node:fs")).writeFileSync(list, listText);
  run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", path.join(out, `${id}.screen.mp4`)]);
  console.log("scene", id, total.toFixed(1) + "s");
}
await browser.close();
