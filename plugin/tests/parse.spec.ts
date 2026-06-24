import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseFiles, hexToRgba, type UploadedFile } from "../src/shared/dtcg/parse.js";
import { DEFAULT_SETTINGS, planForFiles, type FileTokens } from "../src/shared/mapping/toFigma.js";
import type { Token } from "../src/shared/dtcg/types.js";

function loadFixture(name: string): { uploads: UploadedFile[]; expected: any } {
  const base = join(__dirname, "fixtures", name);
  const expected = JSON.parse(readFileSync(join(base, "expected.json"), "utf8"));
  const uploads: UploadedFile[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (e.endsWith(".json") && e !== "expected.json") {
        uploads.push({
          path: relative(base, full).split(/[/\\]/).join("/"),
          json: JSON.parse(readFileSync(full, "utf8")),
        });
      }
    }
  };
  walk(base);
  return { uploads, expected };
}

describe("DTCG parse — m1-primitives fixture", () => {
  const { uploads, expected } = loadFixture("m1-primitives");
  const { tokens, warnings } = parseFiles(uploads);

  it("parses the expected number of tokens with no warnings", () => {
    expect(warnings).toEqual([]);
    expect(tokens.length).toBe(expected.tokens);
  });

  it("emits the expected names, types, and values", () => {
    const byName = Object.fromEntries(
      tokens.map((t) => [t.name, { type: t.type, value: t.value }]),
    );
    expect(byName).toEqual(expected.byName);
  });
});

describe("planForFiles — m1 primitives fixture", () => {
  const { uploads, expected } = loadFixture("m1-primitives");
  const fts: FileTokens[] = uploads.map((u) => {
    const tokens: Token[] = parseFiles([u]).tokens;
    return { file: u.path, tokens };
  });
  const plan = planForFiles(fts, DEFAULT_SETTINGS);

  it("produces one collection with one mode", () => {
    expect(plan.collections.length).toBe(expected.collections);
    expect(plan.collections[0].name).toBe("Primitives");
    expect(plan.collections[0].modes).toEqual(["Value"]);
  });

  it("emits one variable op per token, color → COLOR and dimension → FLOAT", () => {
    expect(plan.variables.length).toBe(expected.tokens);
    const colorOp = plan.variables.find((v) => v.name === "color/blue/500")!;
    expect(colorOp.resolvedType).toBe("COLOR");
    expect(colorOp.values).toEqual([
      { mode: "Value", value: { kind: "literal", value: "#0D99FF" } },
    ]);
    const numOp = plan.variables.find((v) => v.name === "space/200")!;
    expect(numOp.resolvedType).toBe("FLOAT");
    expect(numOp.values).toEqual([
      { mode: "Value", value: { kind: "literal", value: 16 } },
    ]);
  });
});

describe("hexToRgba", () => {
  it("parses #rrggbb", () => {
    expect(hexToRgba("#0D99FF")).toEqual({
      r: 13 / 255,
      g: 153 / 255,
      b: 255 / 255,
      a: 1,
    });
  });
  it("parses #rgb shorthand", () => {
    expect(hexToRgba("#f00")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });
  it("parses #rrggbbaa with alpha", () => {
    const v = hexToRgba("#00000080")!;
    expect(v.r).toBe(0);
    expect(v.a).toBeCloseTo(128 / 255, 5);
  });
  it("returns null for invalid", () => {
    expect(hexToRgba("not-a-color")).toBeNull();
  });
});

describe("parse warnings", () => {
  it("warns on unsupported $type", () => {
    const { tokens, warnings } = parseFiles([
      {
        path: "shadow.json",
        json: { shadow: { md: { $type: "shadow", $value: "1px 1px" } } },
      },
    ]);
    expect(tokens).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0].reason).toMatch(/unsupported/);
  });
  it("warns on root that isn't an object", () => {
    const { warnings } = parseFiles([{ path: "x.json", json: 42 }]);
    expect(warnings[0].reason).toMatch(/not a JSON object/);
  });
});
