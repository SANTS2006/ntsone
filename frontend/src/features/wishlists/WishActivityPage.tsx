import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getActivity, wishKeys, type WishEvent } from "./api";
import { useWishlistContext } from "./WishlistLayout";
import { dayText, EmptyState, money } from "./ui";

const FIELD_LABEL: Record<string, string> = {
  name: "name",
  quantity: "quantity",
  unitPriceMinor: "price each",
  priority: "priority",
  category: "category",
  notes: "notes",
  link: "link",
  paidMinor: "price paid",
  gottenAt: "date gotten",
  store: "where from",
  gottenNote: "note",
  description: "description",
  budgetMinor: "budget",
  targetDate: "target date",
  color: "colour",
};
const MONEY_FIELDS = new Set(["unitPriceMinor", "paidMinor", "budgetMinor"]);

const show = (field: string, value: unknown) => {
  if (value === null || value === undefined || value === "") return "nothing";
  if (MONEY_FIELDS.has(field)) return money(Number(value));
  if ((field === "gottenAt" || field === "targetDate") && typeof value === "string") return dayText(value);
  return String(value).slice(0, 60);
};

/** One line of the record, in plain words. */
function describeEvent(e: WishEvent): string {
  const d = (e.details ?? {}) as Record<string, unknown>;
  const name = e.itemName ? `"${e.itemName}"` : "an item";
  switch (e.type) {
    case "list_created":
      return "Created this wish list";
    case "list_updated":
      return `Changed the list: ${Object.entries(d as Record<string, { from: unknown; to: unknown }>).map(([k, v]) => `${FIELD_LABEL[k] ?? k} from ${show(k, v.from)} to ${show(k, v.to)}`).join("; ")}`;
    case "list_archived":
      return "Archived the list";
    case "list_restored":
      return "Moved the list back from the archive";
    case "list_removed":
      return "Removed the list";
    case "item_added": {
      const q = Number(d.quantity ?? 1);
      const p = d.unitPriceMinor;
      return `Added ${name}${q > 1 ? ` (x${q})` : ""}${p !== null && p !== undefined ? ` at ${money(Number(p))} each` : ""}`;
    }
    case "item_updated":
      return `Changed ${name}: ${Object.entries(d as Record<string, { from: unknown; to: unknown }>).map(([k, v]) => `${FIELD_LABEL[k] ?? k} from ${show(k, v.from)} to ${show(k, v.to)}`).join("; ")}`;
    case "item_gotten":
      return `Got ${name} for ${money(Number(d.paidMinor ?? 0))} on ${dayText(String(d.gottenAt ?? ""))}${d.store ? ` from ${String(d.store)}` : ""}`;
    case "item_ungotten":
      return `Moved ${name} back to the wish list (it had been gotten for ${money(Number(d.paidMinor ?? 0))} on ${dayText(String(d.gottenAt ?? ""))})`;
    case "item_removed":
      return `Removed ${name}`;
    case "item_restored":
      return `Restored ${name}`;
    case "share_created":
      return `Invited ${String(d.label ?? "someone")} (${d.level === "write" ? "can edit" : "can view"})`;
    case "share_updated":
      return `Changed access for ${String(d.label ?? "someone")}`;
    case "share_revoked":
      return `Removed ${String(d.label ?? "someone")}'s access`;
    case "share_reset":
      return `Made a new link for ${String(d.label ?? "someone")}`;
    case "share_emailed":
      return `Emailed the link to ${String(d.label ?? "someone")}`;
    default:
      return e.type;
  }
}

/** Everything that ever happened on this list, newest first. Nothing here can be edited or deleted. */
export function WishActivityPage() {
  const { wishlist, shared } = useWishlistContext();
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: wishKeys.activity(wishlist.id, page), queryFn: () => getActivity(wishlist.id, page), placeholderData: (prev) => prev });
  if (isLoading) return <Loading label="Loading the activity" />;
  if (isError || !data)
    return (
      <EmptyState title="The activity could not be loaded.">
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </EmptyState>
    );
  if (data.items.length === 0) return <EmptyState title="No activity yet." />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">A record of everything done on this list. It cannot be changed.</p>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border/70">
            {data.items.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <p className="min-w-0 break-words text-sm">
                  {describeEvent(e)}
                  {e.byShare ? <span className="text-muted-foreground"> by {e.byShare}{shared ? "" : " (shared link)"}</span> : shared ? <span className="text-muted-foreground"> by the owner</span> : null}
                </p>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={e.createdAt}>
                  {new Date(e.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Newer
          </Button>
          <span>
            Page {data.page} of {data.totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Older
          </Button>
        </div>
      )}
    </div>
  );
}
