import { describe, expect, it } from "vitest";
import { parseColor } from "../src/shared/writer/color.js";

describe("parseColor — hex", () => {
  it("parses #rrggbb", () => {
    expect(parseColor("#0D99FF")).toEqual({
      r: 13 / 255,
      g: 153 / 255,
      b: 255 / 255,
      a: 1,
    });
  });
  it("parses #rgb shorthand", () => {
    expect(parseColor("#f00")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });
  it("parses #rrggbbaa with alpha", () => {
    const v = parseColor("#00000080")!;
    expect(v.r).toBe(0);
    expect(v.a).toBeCloseTo(128 / 255, 5);
  });
  it("returns null for invalid", () => {
    expect(parseColor("not-a-color")).toBeNull();
  });
});

describe("parseColor — rgb()/rgba()", () => {
  it("parses rgb(r,g,b)", () => {
    expect(parseColor("rgb(255,0,128)")).toEqual({
      r: 1,
      g: 0,
      b: 128 / 255,
      a: 1,
    });
  });
  it("parses rgba(r,g,b,a) with 0–1 alpha", () => {
    const v = parseColor("rgba(5,4,0,0.5)")!;
    expect(v.r).toBeCloseTo(5 / 255, 6);
    expect(v.g).toBeCloseTo(4 / 255, 6);
    expect(v.b).toBe(0);
    expect(v.a).toBe(0.5);
  });
  it("parses rgba with fully transparent alpha", () => {
    expect(parseColor("rgba(255,255,255,0)")).toEqual({
      r: 1,
      g: 1,
      b: 1,
      a: 0,
    });
  });
  it("accepts percent channels and percent alpha", () => {
    expect(parseColor("rgba(100%, 0%, 50%, 50%)")).toEqual({
      r: 1,
      g: 0,
      b: 0.5,
      a: 0.5,
    });
  });
  it("accepts whitespace and slash separators (CSS Color 4)", () => {
    expect(parseColor("rgb(255 0 128 / 0.25)")).toEqual({
      r: 1,
      g: 0,
      b: 128 / 255,
      a: 0.25,
    });
  });
  it("returns null for unsupported formats", () => {
    expect(parseColor("hsl(0, 100%, 50%)")).toBeNull();
    expect(parseColor("not-a-color")).toBeNull();
    expect(parseColor("rgb(1,2)")).toBeNull();
  });
});
