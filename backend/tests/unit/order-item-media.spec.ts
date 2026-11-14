import { describe, expect, it } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";
process.env.CLOUDINARY_CLOUD_NAME = "demo-cloud";

const { orderItemSchema, resolveOrderItems, MAX_ITEM_IMAGES } = await import("../../src/modules/payments/pricing.js");

const image = (n: number) => `https://res.cloudinary.com/demo-cloud/image/upload/v1/items/photo${n}.jpg`;
const video = (n: number) => `https://res.cloudinary.com/demo-cloud/video/upload/v1/items/clip${n}.mp4`;
const base = { id: "item_1", name: "Rice", priceMinor: 10_000 };

describe("order item pictures and videos", () => {
  it("accepts several pictures and an optional video", () => {
    expect(orderItemSchema.safeParse({ ...base, images: [image(1), image(2)], videos: [video(1)] }).success).toBe(true);
    expect(orderItemSchema.safeParse({ ...base, images: [image(1)] }).success).toBe(true);
    expect(orderItemSchema.safeParse(base).success).toBe(true);
  });

  it("refuses links from elsewhere, or of the wrong kind", () => {
    expect(orderItemSchema.safeParse({ ...base, images: ["https://example.com/a.jpg"] }).success).toBe(false);
    expect(orderItemSchema.safeParse({ ...base, images: [video(1)] }).success).toBe(false);
    expect(orderItemSchema.safeParse({ ...base, videos: [image(1)] }).success).toBe(false);
    expect(orderItemSchema.safeParse({ ...base, videos: ["https://res.cloudinary.com/other/video/upload/x.mp4"] }).success).toBe(false);
  });

  it("limits how many there can be", () => {
    const tooMany = Array.from({ length: MAX_ITEM_IMAGES + 1 }, (_, i) => image(i));
    expect(orderItemSchema.safeParse({ ...base, images: tooMany }).success).toBe(false);
    expect(orderItemSchema.safeParse({ ...base, videos: [video(1), video(2), video(3), video(4)] }).success).toBe(false);
  });

  it("still reads items saved before pictures and videos existed", () => {
    expect(resolveOrderItems([{ ...base, imageUrl: image(1) }])).toHaveLength(1);
  });
});
