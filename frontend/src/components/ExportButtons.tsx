import * as React from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/RefreshButton";
import { ApiError, downloadAuthenticatedFile } from "@/lib/api";

/**
 * "Export CSV" and "Export Excel" for a table. `path` is the list's export endpoint; `params` are
 * the filters currently applied, so the file matches what's on screen.
 */
export function ExportButtons({
  path,
  params = {},
  fileLabel,
  size = "sm",
}: {
  path: string;
  params?: Record<string, string | number | undefined | null>;
  fileLabel: string;
  size?: "sm" | "default";
}) {
  const [busy, setBusy] = React.useState<"csv" | "xlsx" | null>(null);

  const download = async (format: "csv" | "xlsx") => {
    setBusy(format);
    const search = new URLSearchParams({ format });
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
    try {
      await downloadAuthenticatedFile(`${path}?${search.toString()}`, `${fileLabel}.${format}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "The export didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <RefreshButton size={size} />
      <Button variant="outline" size={size} loading={busy === "csv"} disabled={busy !== null} onClick={() => download("csv")}>
        <FileText className="h-4 w-4" />
        Export CSV
      </Button>
      <Button variant="outline" size={size} loading={busy === "xlsx"} disabled={busy !== null} onClick={() => download("xlsx")}>
        <FileSpreadsheet className="h-4 w-4" />
        Export Excel
      </Button>
    </div>
  );
}
