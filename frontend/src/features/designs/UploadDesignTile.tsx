import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The gallery tile for the organization's own uploaded design: select, replace, or remove it. */
export function UploadDesignTile({
  imageUrl,
  active,
  uploading,
  aspectClassName,
  onSelect,
  onUpload,
  onRemove,
}: {
  imageUrl?: string;
  active: boolean;
  uploading: boolean;
  aspectClassName: string;
  onSelect: () => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-2 text-center transition-colors",
        active ? "border-primary bg-gradient-brand-soft" : "border-border hover:border-primary/50",
      )}
    >
      {imageUrl ? (
        <button type="button" onClick={onSelect} className="w-full" aria-label="Use your uploaded design">
          <img src={imageUrl} alt="Your uploaded design" className={cn("w-full rounded-md object-cover", aspectClassName)} />
        </button>
      ) : (
        <Upload className="h-5 w-5 text-muted-foreground" />
      )}
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Button variant="outline" size="sm" className="relative h-7 px-2 text-xs" loading={uploading}>
          {uploading ? "Uploading..." : imageUrl ? "Replace" : "Your own design"}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </Button>
        {imageUrl && !uploading && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
