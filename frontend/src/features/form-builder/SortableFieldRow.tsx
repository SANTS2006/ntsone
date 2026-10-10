import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { metaFor } from "./fieldTypes";
import type { EditableField } from "./types";

export function SortableFieldRow({
  field,
  onEdit,
  onDelete,
}: {
  field: EditableField;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.fieldKey });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-2.5 sm:gap-3 sm:px-3 ${isDragging ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        aria-label="Reorder field"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-sm font-medium">{field.label || "Untitled field"}</p>
          {field.required && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Required
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {metaFor(field.type).label} &middot; {field.fieldKey}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onEdit} aria-label="Edit field">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onDelete} aria-label="Delete field">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
