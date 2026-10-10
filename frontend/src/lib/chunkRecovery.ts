/**
 * Pages are downloaded in pieces ("chunks") the first time they are opened. After a new version of the site goes
 * live, the pieces an already-open tab knows about no longer exist, so opening a page fails. That used to leave a
 * blank screen until the visitor refreshed by hand. These helpers recognise that failure and recover from it once,
 * safely, without ever reloading in a loop.
 */

const RELOAD_KEY = "chunk-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  const text = `${(error as { name?: string })?.name ?? ""} ${(error as { message?: string })?.message ?? String(error ?? "")}`;
  return /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk [\w-]+ failed|Loading CSS chunk/i.test(text);
}

/** True when this tab already reloaded for a stale-version problem a moment ago (so another reload would not help). */
function reloadedRecently(): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    return Date.now() - at < RELOAD_COOLDOWN_MS;
  } catch {
    return true; // cannot remember, so do not risk a loop
  }
}

/** Reloads the page once to pick up the new version. Returns false when it already did so recently. */
export function reloadForNewVersion(): boolean {
  if (reloadedRecently()) return false;
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Imports a page, trying once more after a short pause (a brief network drop should not fail the page). */
export async function importWithRetry<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (!isChunkLoadError(err)) throw err;
    await new Promise((resolve) => window.setTimeout(resolve, 800));
    return load();
  }
}
