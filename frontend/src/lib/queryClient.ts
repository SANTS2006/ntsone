import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "./api";
import { isLiveQuery, LIVE_REFRESH_MS } from "./liveData";

const recentlyShown = new Map<string, number>();

/** Words for a failed request that a person can act on. */
export function describeLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "NETWORK_ERROR" || error.code === "TIMEOUT") return error.message;
    if (error.statusCode === 403) return "You do not have permission to see this.";
    if (error.statusCode === 404) return "This could not be found.";
    if (error.statusCode === 429) return "Too many requests. Please wait a moment and try again.";
    if (error.statusCode >= 500) return "The server had a problem. Please try again in a moment.";
    return error.message;
  }
  return "Something went wrong while loading. Please try again.";
}

export const queryClient: QueryClient = new QueryClient({
  // When a page's data fails to load for the first time, say so with a Retry button (instead of leaving an empty or
  // endless "loading" page). A background refresh that fails keeps showing the data already on screen, quietly.
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.state.data !== undefined) return;
      if (query.meta?.silent) return;
      // 401: the session handling shows the sign-in page. 403 and 404: the page itself says so (no access, not found).
      if (error instanceof ApiError && [401, 403, 404].includes(error.statusCode)) return;
      const message = describeLoadError(error);
      const last = recentlyShown.get(message) ?? 0;
      if (Date.now() - last < 8_000) return; // one message for a burst of failures
      recentlyShown.set(message, Date.now());
      toast.error(message, { id: `load-error:${message}`, action: { label: "Try again", onClick: () => void queryClient.invalidateQueries({ queryKey: query.queryKey }) } });
    },
  }),
  defaultOptions: {
    queries: {
      // Not worth retrying a refusal or a missing item; a dropped connection or a busy server often works the second time.
      retry: (failureCount, error) => failureCount < 2 && !(error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 408 && error.statusCode !== 429),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Tables and lists load new data by themselves; this pauses while the tab is in the background.
      refetchInterval: (query) => (isLiveQuery(query.queryKey) ? LIVE_REFRESH_MS : false),
    },
  },
});
