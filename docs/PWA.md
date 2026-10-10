# Installing NTSOne as an app (PWA)

NTSOne is a **progressive web app**: it installs from the browser on **iPhone, iPad, Android phones and computers**. There is nothing to download from a store, and it is the same system, always up to date.

## 1. What people get
- An **app icon** on the home screen or desktop (the NTS logo).
- It **opens full screen**, without the browser's address bar, and signed-in people land on their dashboard.
- It **opens fast**: the built files are kept on the device.
- When the connection is gone or very slow, it opens the last copy of the app, or a friendly **"You are offline"** page, instead of the browser's error page. A small notice at the top says when the device is offline.
- **Shortcuts** (long-press the icon on Android): Dashboard, Wish List, Programs.
- A prompt to install appears a few seconds after someone arrives (never if it is already installed). "Not now" hides it for two weeks. An **Install app** button is also in the website footer and in the app's sidebar.

## 2. How to install
| Where | How |
|---|---|
| **Android (Chrome, Edge, Samsung Internet)** | Tap **Install** on the prompt (or the browser menu, then Install app / Add to Home screen). |
| **iPhone and iPad** | Open the site in **Safari**, tap the **Share** button, then **Add to Home Screen**, then **Add**. (Apple's browser has no install button, so the app shows these steps when someone taps "Show me how".) Links opened inside WhatsApp or Facebook must be opened in Safari first. |
| **Windows, Mac, Linux** | In Chrome or Edge, use the install icon in the address bar, or the **Install app** button on the site. |

Installing needs the site to be on **HTTPS** (it is on Render).

## 3. What the offline support does and does not do
**Does:** keeps `/assets/*` (the built app), images and fonts; opens pages from the network first and falls back to the last copy of the app after 4 seconds or when offline; shows `/offline.html` if there is no copy yet; cleans out old versions when a new one starts.

**Never does:** touch `/api/` (private data is always live and never stored by the worker), `/payment/` (the return from the payment provider always reaches the server), anything that is not a GET, or anything on another website.

**Does not do (yet):** let people create or change data while offline. Registrations, orders, bookkeeping entries and votes need a connection and show a clear error without one. Working offline with later syncing would be a separate project (bookkeeping would benefit most). There are no push notifications yet.

## 4. How it is built
| File | Job |
|---|---|
| `frontend/public/manifest.webmanifest` | The app's name, icons (including a maskable one), colours, start page (`/admin`), scope and shortcuts |
| `frontend/public/sw.js` | The service worker (plain JavaScript, no library) |
| `frontend/public/offline.html`, `offline.js` | The offline page (its button is in a separate file because the site's security policy blocks scripts written inside a page) |
| `frontend/src/lib/pwa.ts` | Registers the worker (real site only, never in development), catches the browser's install offer early, detects iPhones, remembers "Not now" |
| `frontend/src/components/InstallApp.tsx` | The install prompt, the iPhone steps, the Install app button and the offline notice |
| `frontend/index.html` | The iPhone and Android tags (`apple-mobile-web-app-*`, `mobile-web-app-capable`, icons) |

### Updates
Pages are always fetched from the network first, so a new version of the app is picked up on the next open. When the **service worker file itself** changes, people see "A new version of NTSOne is ready" with an **Update** button; nothing is swapped while they work. To force every device to start clean, change `VERSION` at the top of `sw.js`.

The server sends `sw.js` and the manifest with `Cache-Control: no-cache` so a new worker is noticed straight away, and built files with a one-year cache (their names change with every build).

### Icons
Generated from the logo: 48 px favicon, 180 px iPhone icon, 192 and 512 px app icons on a white tile, and a 512 px **maskable** icon with the logo inside the safe zone so any shape Android cuts it to still shows it all. The original artwork is in `docs/brand/ntsone-logo.png`.

## 5. Checks that were run
- Chrome (real, headless) reported **no installability errors** and no manifest errors.
- The worker registered, took control, and filled its caches; no `/api/` or `/payment/` address was stored.
- With the server switched off, the app still opened from the worker, including a page that had never been visited.
- The install prompt appears on Android and calls the browser's own install dialog; on an iPhone it shows the three steps; it stays away after "Not now" and when already installed.
- 12 unit tests run the real `sw.js` against a simulated browser; the server tests check that the worker, manifest, icons and offline page are served with the right headers.

**Not tested here:** an actual iPhone or an actual Android phone. Test the install on both after the next deploy.

## 6. Limits to know
- On iPhone, installed apps cannot get the browser's install prompt, push notifications need iOS 16.4 or later and an installed app, and Apple may clear a web app's stored data if it is not opened for a few weeks.
- The status bar on iPhone uses the default (light) style. Dark-themed full-bleed status bars would need extra padding for the notch.
- No custom iPhone splash screens are provided; iOS shows the icon on a plain background while the app starts.
