import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isLiveQuery } from "@/lib/liveData";
import { cn } from "@/lib/utils";

/**
 * Reloads the lists and tables on the current page right now. They also refresh by themselves every
 * few seconds, so this is for when someone wants the latest data this moment.
 */
export function RefreshButton({ size = "sm", label = "Refresh" }: { size?: "sm" | "default"; label?: string }) {
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ predicate: (query) => isLiveQuery(query.queryKey) }) > 0;
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={fetching}
      aria-label="Refresh the table with the latest data"
      title="Load the latest data"
      onClick={() => void queryClient.refetchQueries({ predicate: (query) => isLiveQuery(query.queryKey), type: "active" })}
    >
      <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
      {label}
    </Button>
  );
}
