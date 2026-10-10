import { describe, expect, it } from "vitest";
import { isSharedScope, parseLines, root, sharedScope } from "./api";
import { readPrice } from "./ui";

describe("pasting a list of wishes", () => {
  it("reads name, quantity and price from each line, all but the name optional", () => {
    expect(parseLines("Rice, 5, 350\nCooking oil, 2, 120\nSchool bag")).toEqual([
      { name: "Rice", quantity: 5, priceText: "350" },
      { name: "Cooking oil", quantity: 2, priceText: "120" },
      { name: "School bag", quantity: undefined, priceText: undefined },
    ]);
  });
  it("ignores blank lines, accepts other separators and Windows line endings, and stops at 100", () => {
    expect(parseLines("\n  \nSofa;1;4000\r\nChair\t4\t500\r\n")).toHaveLength(2);
    expect(parseLines(Array.from({ length: 150 }, (_, i) => `Item ${i}`).join("\n"))).toHaveLength(100);
  });
  it("does not treat a non-number in the quantity place as a quantity", () => {
    expect(parseLines("Phone, black, 900")[0]).toMatchObject({ name: "Phone", quantity: undefined });
  });
});

describe("reading a typed price", () => {
  it("treats empty as no price, reads Leones as cents and rejects nonsense", () => {
    expect(readPrice("")).toEqual({ minor: null, invalid: false });
    expect(readPrice("1,250.50")).toEqual({ minor: 125050, invalid: false });
    expect(readPrice("0")).toEqual({ minor: 0, invalid: false });
    expect(readPrice("12.345").invalid).toBe(true);
    expect(readPrice("abc").invalid).toBe(true);
    expect(readPrice("-5").invalid).toBe(true);
  });
});

describe("which address a list screen talks to", () => {
  it("uses the signed-in routes for the owner and the public link routes for a shared link", () => {
    expect(root("11111111-1111-4111-8111-111111111111")).toBe("/wishlists/11111111-1111-4111-8111-111111111111");
    const scope = sharedScope("abc.def");
    expect(isSharedScope(scope)).toBe(true);
    expect(root(scope)).toBe("/public/wish/abc.def");
    expect(isSharedScope("11111111-1111-4111-8111-111111111111")).toBe(false);
  });
});
