import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isChunkLoadError, reloadForNewVersion } from "@/lib/chunkRecovery";
import { reportClientError } from "@/lib/clientErrors";

interface Props {
  children: React.ReactNode;
  /** When this value changes (for example the address), a shown error is cleared so the next page gets a fresh start. */
  resetKey?: string;
  /** Fills the screen (for the whole app) instead of sitting inside a page. */
  fullScreen?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * Catches errors while a page loads or draws, so one broken page shows a message with a Try again button instead of
 * a blank white screen. A page piece that failed to download (usually because a new version went live) is retried by
 * reloading once; if that does not help, the visitor sees the message instead of a reload loop.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportClientError(isChunkLoadError(error) ? "chunk.load" : "render", error);
    if (isChunkLoadError(error)) reloadForNewVersion();
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private retry = () => {
    if (isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isChunkLoadError(error);
    return (
      <div role="alert" className={`flex flex-col items-center justify-center gap-4 px-4 text-center ${this.props.fullScreen ? "min-h-screen" : "min-h-[40vh] py-10"}`}>
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </span>
        <div className="max-w-md space-y-1">
          <h2 className="text-lg font-semibold">{stale ? "A new version is available" : "Something went wrong while loading this page"}</h2>
          <p className="text-sm text-muted-foreground">
            {stale ? "The site was updated while this page was open. Reload to continue." : "This is on our side, not yours. Your work elsewhere is safe. Please try again."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={this.retry}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            {stale ? "Reload" : "Try again"}
          </Button>
          {this.props.fullScreen && (
            <Button variant="outline" onClick={() => window.location.assign("/")}>
              Go to the home page
            </Button>
          )}
        </div>
      </div>
    );
  }
}
