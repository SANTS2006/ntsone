import type { OrderItem } from "@/types/api";

/** Most pictures and videos one item may have (the server checks the same limits). */
export const MAX_ITEM_IMAGES = 10;
export const MAX_ITEM_VIDEOS = 3;
/** Largest files accepted, in bytes. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Every picture of an item, cover first. Older items only have `imageUrl`. */
export function itemImages(item: Pick<OrderItem, "images" | "imageUrl">): string[] {
  if (item.images && item.images.length > 0) return item.images;
  return item.imageUrl ? [item.imageUrl] : [];
}

export const itemVideos = (item: Pick<OrderItem, "videos">): string[] => item.videos ?? [];

/**
 * A Cloudinary picture resized for display and served in a format the browser can show
 * (HEIC photos from iPhones become JPEG/WebP). Other links are returned as they are.
 */
export function imageAt(url: string, width: number): string {
  return url.includes("/image/upload/") ? url.replace("/image/upload/", `/image/upload/f_auto,q_auto,c_limit,w_${width}/`) : url;
}

/** A still frame from the start of a Cloudinary video, to show before it plays. */
export function videoPoster(url: string, width = 800): string | undefined {
  if (!url.includes("/video/upload/")) return undefined;
  return url.replace("/video/upload/", `/video/upload/so_0,c_limit,w_${width}/`).replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
}

/** The video as MP4, which every browser plays (an iPhone's .mov may not play in Chrome otherwise). */
export function videoMp4(url: string): string {
  return url.includes("/video/upload/") ? url.replace(/\.[a-z0-9]+(\?.*)?$/i, ".mp4") : url;
}
