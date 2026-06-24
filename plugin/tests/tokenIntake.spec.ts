import { describe, expect, it } from "vitest";
import { fromUploads } from "../src/shared/intake/tokenIntake.js";

describe("TokenIntake.fromUploads", () => {
  it("buckets tokens by source file", () => {
    const { files } = fromUploads([
      {
        path: "core/color.json",
        json: { color: { red: { $type: "color", $value: "#FF0000" } } },
      },
      {
        path: "core/space.json",
        json: { space: { sm: { $type: "dimension", $value: 8 } } },
      },
    ]);
    expect(files).toHaveLength(2);
    expect(files[0]!.file).toBe("core/color.json");
    expect(files[0]!.tokens).toHaveLength(1);
    expect(files[1]!.file).toBe("core/space.json");
    expect(files[1]!.tokens).toHaveLength(1);
  });

  it("emits an empty token list for files with no tokens", () => {
    const { files } = fromUploads([{ path: "empty.json", json: {} }]);
    expect(files[0]!.tokens).toEqual([]);
  });

  it("surfaces parser warnings unchanged", () => {
    const { warnings } = fromUploads([
      {
        path: "weird.json",
        json: { x: { $type: "shadow", $value: "1px 1px" } },
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toMatch(/unsupported/);
  });

  it("preserves file ordering from input", () => {
    const { files } = fromUploads([
      { path: "z.json", json: {} },
      { path: "a.json", json: {} },
      { path: "m.json", json: {} },
    ]);
    expect(files.map((f) => f.file)).toEqual(["z.json", "a.json", "m.json"]);
  });
});
