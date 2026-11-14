import * as React from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Plus, ShoppingBag, Star, Trash2, Video, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinor, minorToInput, parseLeones } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OrderItem } from "@/types/api";
import { getProgramUploadSignature, uploadToCloudinaryWithProgress } from "../programs/api";
import { imageAt, itemImages, MAX_IMAGE_BYTES, MAX_ITEM_IMAGES, MAX_ITEM_VIDEOS, MAX_VIDEO_BYTES, videoMp4, videoPoster } from "./itemMedia";

/** A file still on its way to Cloudinary. */
interface PendingUpload {
  id: string;
  kind: "image" | "video";
  name: string;
  progress: number;
  /** A local preview while the upload runs. */
  previewUrl: string;
}

/** An item as it is typed: the price stays text until it is read as money. */
export interface EditableItem extends Omit<OrderItem, "priceMinor" | "imageUrl"> {
  price: string;
  images: string[];
  videos: string[];
  /** Pictures and videos still uploading; never sent to the server. */
  uploads?: PendingUpload[];
}

export function toEditable(items: OrderItem[]): EditableItem[] {
  return items.map(({ priceMinor, imageUrl, images, videos, ...rest }) => ({
    ...rest,
    price: minorToInput(priceMinor),
    images: itemImages({ images, imageUrl }),
    videos: videos ?? [],
  }));
}

/** The items as the server wants them, or an error message for the first problem. */
export function fromEditable(items: EditableItem[]): { items: OrderItem[]; error?: string } {
  const out: OrderItem[] = [];
  for (const [index, item] of items.entries()) {
    const name = item.name.trim();
    const priceMinor = parseLeones(item.price);
    if (!name) return { items: [], error: `Item ${index + 1} needs a name.` };
    if (priceMinor === null || priceMinor <= 0) return { items: [], error: `"${name}" needs a price above zero.` };
    if (item.uploads && item.uploads.length > 0) return { items: [], error: `Wait for the pictures and videos of "${name}" to finish uploading.` };
    out.push({
      id: item.id,
      name,
      description: item.description?.trim() || undefined,
      priceMinor,
      imageUrl: item.images[0],
      images: item.images.length > 0 ? item.images : undefined,
      videos: item.videos.length > 0 ? item.videos : undefined,
      maxQuantity: item.maxQuantity,
    });
  }
  return { items: out };
}

const newId = (prefix = "item") => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

type ItemsUpdate = (update: (items: EditableItem[]) => EditableItem[]) => void;

/**
 * The goods an order form sells, with their prices, pictures and videos. They show on the live order page; the customer
 * picks quantities, sees the total and pays. Prices are always read from here on the server, never from the customer's browser.
 */
export function OrderItemsEditor({ programId, items, onChange }: { programId: string; items: EditableItem[]; onChange: ItemsUpdate }) {
  // Always applied to the latest list, so an upload finishing never undoes typing done meanwhile.
  const update = (id: string, patch: Partial<EditableItem> | ((item: EditableItem) => Partial<EditableItem>)) =>
    onChange((list) => list.map((item) => (item.id === id ? { ...item, ...(typeof patch === "function" ? patch(item) : patch) } : item)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-4 w-4 text-primary" />
          Items for sale
        </CardTitle>
        <CardDescription>
          List what you sell, its price, and pictures of it. A video is optional. Customers browse your items on the order page, choose how many of each, and the total is worked out for them. Save the form to keep your changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.length === 0 && <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No items yet. Add your first item below.</p>}
        {items.map((item, index) => {
          const price = parseLeones(item.price);
          return (
            <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-border/70 p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem_7rem_auto] sm:items-start">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${item.id}-name`}>Item {index + 1}</Label>
                  <Input id={`${item.id}-name`} placeholder="e.g. Rice, 25 kg bag" maxLength={100} value={item.name} onChange={(e) => update(item.id, { name: e.target.value })} />
                  <Input aria-label={`Description of item ${index + 1}`} placeholder="Short description (optional)" maxLength={300} value={item.description ?? ""} onChange={(e) => update(item.id, { description: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${item.id}-price`}>Price (NLe)</Label>
                  <Input id={`${item.id}-price`} inputMode="decimal" placeholder="0.00" value={item.price} onChange={(e) => update(item.id, { price: e.target.value })} aria-invalid={price === null || undefined} />
                  <p className="text-xs text-muted-foreground">{price ? formatMinor(price) : "Price per item"}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${item.id}-max`}>Most per order</Label>
                  <Input
                    id={`${item.id}-max`}
                    type="number"
                    min={1}
                    max={1000}
                    placeholder="No limit"
                    value={item.maxQuantity ?? ""}
                    onChange={(e) => update(item.id, { maxQuantity: e.target.value ? Math.min(1000, Math.max(1, Number(e.target.value))) : undefined })}
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" className="sm:mt-6" aria-label={`Remove item ${index + 1}`} onClick={() => onChange((list) => list.filter((i) => i.id !== item.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <ItemMediaEditor programId={programId} item={item} label={item.name.trim() || `item ${index + 1}`} update={(patch) => update(item.id, patch)} />
            </div>
          );
        })}
        <Button type="button" variant="outline" className="w-fit" disabled={items.length >= 200} onClick={() => onChange((list) => [...list, { id: newId(), name: "", price: "", images: [], videos: [] }])}>
          <Plus className="h-4 w-4" />
          Add an item
        </Button>
      </CardContent>
    </Card>
  );
}

/** One item's pictures (one or many, the first is the cover) and its optional videos. */
function ItemMediaEditor({
  programId,
  item,
  label,
  update,
}: {
  programId: string;
  item: EditableItem;
  label: string;
  update: (patch: (item: EditableItem) => Partial<EditableItem>) => void;
}) {
  const [dragging, setDragging] = React.useState(false);
  const uploads = item.uploads ?? [];
  const pendingImages = uploads.filter((u) => u.kind === "image");
  const pendingVideos = uploads.filter((u) => u.kind === "video");

  const upload = async (file: File, kind: "image" | "video") => {
    const pending: PendingUpload = { id: newId("up"), kind, name: file.name, progress: 0, previewUrl: URL.createObjectURL(file) };
    const setPending = (change: (u: PendingUpload[]) => PendingUpload[]) => update((current) => ({ uploads: change(current.uploads ?? []) }));
    setPending((u) => [...u, pending]);
    try {
      const signature = await getProgramUploadSignature(programId, kind);
      const { secureUrl } = await uploadToCloudinaryWithProgress(file, signature, (progress) =>
        setPending((u) => u.map((p) => (p.id === pending.id ? { ...p, progress } : p))),
      );
      update((current) => ({
        uploads: (current.uploads ?? []).filter((p) => p.id !== pending.id),
        ...(kind === "image" ? { images: [...current.images, secureUrl] } : { videos: [...current.videos, secureUrl] }),
      }));
    } catch (err) {
      setPending((u) => u.filter((p) => p.id !== pending.id));
      toast.error(`Could not upload ${file.name}`, { description: err instanceof Error ? err.message : undefined });
    } finally {
      URL.revokeObjectURL(pending.previewUrl);
    }
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    let imageRoom = MAX_ITEM_IMAGES - item.images.length - pendingImages.length;
    let videoRoom = MAX_ITEM_VIDEOS - item.videos.length - pendingVideos.length;
    for (const file of Array.from(files)) {
      const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name) ? "image" : null;
      if (!kind) {
        toast.error(`${file.name} is not a picture or a video`);
        continue;
      }
      if (kind === "image") {
        if (imageRoom <= 0) {
          toast.error(`An item can have up to ${MAX_ITEM_IMAGES} pictures`);
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(`${file.name} is too large`, { description: "Pictures can be up to 15 MB." });
          continue;
        }
        imageRoom -= 1;
      } else {
        if (videoRoom <= 0) {
          toast.error(`An item can have up to ${MAX_ITEM_VIDEOS} videos`);
          continue;
        }
        if (file.size > MAX_VIDEO_BYTES) {
          toast.error(`${file.name} is too large`, { description: "Videos can be up to 100 MB. Try a shorter clip." });
          continue;
        }
        videoRoom -= 1;
      }
      void upload(file, kind);
    }
  };

  const removeImage = (url: string) => update((current) => ({ images: current.images.filter((u) => u !== url) }));
  const makeCover = (url: string) => update((current) => ({ images: [url, ...current.images.filter((u) => u !== url)] }));
  const removeVideo = (url: string) => update((current) => ({ videos: current.videos.filter((u) => u !== url) }));

  const imageFull = item.images.length + pendingImages.length >= MAX_ITEM_IMAGES;
  const videoFull = item.videos.length + pendingVideos.length >= MAX_ITEM_VIDEOS;

  return (
    <div
      className={cn("flex flex-col gap-3 rounded-lg border border-dashed p-3 transition-colors", dragging ? "border-primary bg-primary/5" : "border-border/70")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Pictures</p>
          <p className="text-xs text-muted-foreground">
            {item.images.length}/{MAX_ITEM_IMAGES} · the first is the cover
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.images.map((url, i) => (
            <div key={url} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-border/70 bg-muted">
              <img src={imageAt(url, 200)} alt={`Picture ${i + 1} of ${label}`} className="h-full w-full object-cover" loading="lazy" />
              {i === 0 ? (
                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">Cover</span>
              ) : (
                <button
                  type="button"
                  onClick={() => makeCover(url)}
                  className="absolute left-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  aria-label={`Make picture ${i + 1} the cover of ${label}`}
                  title="Make this the cover"
                >
                  <Star className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeImage(url)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                aria-label={`Remove picture ${i + 1} of ${label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {pendingImages.map((p) => (
            <UploadingTile key={p.id} upload={p} />
          ))}
          {!imageFull && (
            <AddTile accept="image/*,.heic,.heif" multiple icon={<ImagePlus className="h-5 w-5" />} text="Add pictures" label={`Add pictures of ${label}`} onFiles={addFiles} />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">
            Videos <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {item.videos.length}/{MAX_ITEM_VIDEOS} · up to 100 MB each
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.videos.map((url, i) => (
            <div key={url} className="relative h-20 w-32 overflow-hidden rounded-lg border border-border/70 bg-black">
              <video src={videoMp4(url)} poster={videoPoster(url, 300)} className="h-full w-full object-cover" muted playsInline preload="metadata" controls aria-label={`Video ${i + 1} of ${label}`} />
              <button
                type="button"
                onClick={() => removeVideo(url)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                aria-label={`Remove video ${i + 1} of ${label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {pendingVideos.map((p) => (
            <UploadingTile key={p.id} upload={p} wide />
          ))}
          {!videoFull && <AddTile accept="video/*" multiple wide icon={<Video className="h-5 w-5" />} text="Add a video" label={`Add a video of ${label}`} onFiles={addFiles} />}
        </div>
      </div>
      <p className="hidden text-xs text-muted-foreground sm:block">Tip: you can also drag pictures and videos onto this box.</p>
    </div>
  );
}

function AddTile({
  accept,
  multiple,
  wide,
  icon,
  text,
  label,
  onFiles,
}: {
  accept: string;
  multiple?: boolean;
  wide?: boolean;
  icon: React.ReactNode;
  text: string;
  label: string;
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <label
      className={cn(
        "flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-within:border-primary focus-within:text-primary",
        wide ? "w-32" : "w-20",
      )}
    >
      {icon}
      <span className="px-1 text-center leading-tight">{text}</span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function UploadingTile({ upload, wide }: { upload: PendingUpload; wide?: boolean }) {
  return (
    <div className={cn("relative h-20 overflow-hidden rounded-lg border border-border/70 bg-muted", wide ? "w-32" : "w-20")} aria-live="polite">
      {upload.kind === "image" ? (
        <img src={upload.previewUrl} alt="" className="h-full w-full object-cover opacity-50" />
      ) : (
        <video src={upload.previewUrl} className="h-full w-full object-cover opacity-50" muted playsInline preload="metadata" />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{upload.progress}%</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
        <div className="h-full bg-primary transition-all" style={{ width: `${upload.progress}%` }} />
      </div>
      <span className="sr-only">Uploading {upload.name}</span>
    </div>
  );
}
