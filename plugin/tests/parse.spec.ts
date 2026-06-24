import { describe, it, expect } from "vitest";
import {
  expandTokensStudio,
  parseFiles,
  hexToRgba,
  parseColor,
  dimensionToPx,
} from "../src/shared/dtcg/parse.js";
import { DEFAULT_SETTINGS, planForFiles } from "../src/shared/mapping/toFigma.js";
import { fromUploads } from "../src/shared/intake/tokenIntake.js";
import { loadFixtureUploads } from "./fixtures/loader.js";

const loadFixture = loadFixtureUploads;

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
  const { files: fts } = fromUploads(uploads);
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

describe("parseColor", () => {
  it("delegates to hex for #-prefixed input", () => {
    expect(parseColor("#0D99FF")).toEqual(hexToRgba("#0D99FF"));
  });
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

describe("expandTokensStudio", () => {
  it("returns the file unchanged when no $themes or $metadata present (plain W3C)", () => {
    const f = { path: "core/color.json", json: { color: { red: { $type: "color", $value: "#FF0000" } } } };
    expect(expandTokensStudio(f)).toEqual([f]);
  });

  it("splits a Tokens Studio $metadata.tokenSetOrder file into one entry per set", () => {
    const json = {
      $metadata: { tokenSetOrder: ["core", "SchemeStatic/Light"] },
      $themes: [{ id: "t1", name: "Brand", selectedTokenSets: { core: "enabled" } }],
      core: { color: { red: { $type: "color", $value: "#FF0000" } } },
      "SchemeStatic/Light": { surface: { bg: { $type: "color", $value: "{color.red}" } } },
    };
    const result = expandTokensStudio({ path: "tokens.json", json });
    expect(result).toHaveLength(2);
    expect(result[0]!.path).toBe("core");
    expect(result[1]!.path).toBe("SchemeStatic/Light");
    expect(result[0]!.json).toBe((json as any).core);
  });

  it("token names from expanded sets do NOT include the set key as a prefix", () => {
    const json = {
      $metadata: { tokenSetOrder: ["core"] },
      $themes: [],
      core: { color: { red: { $type: "color", $value: "#FF0000" } } },
    };
    const { tokens } = parseFiles(expandTokensStudio({ path: "tokens.json", json }));
    expect(tokens[0]!.name).toBe("color/red");
    expect(tokens[0]!.file).toBe("core");
  });

  it("aliases in Tokens Studio format resolve correctly after expansion", () => {
    const json = {
      $metadata: { tokenSetOrder: ["core", "semantic"] },
      $themes: [],
      core: { color: { blue: { $type: "color", $value: "#0000FF" } } },
      semantic: { primary: { $type: "color", $value: "{color.blue}" } },
    };
    const expanded = expandTokensStudio({ path: "tokens.json", json });
    const { tokens, warnings } = parseFiles(expanded);
    expect(warnings).toEqual([]);
    expect(tokens).toHaveLength(2);
    const alias = tokens.find((t) => t.name === "primary")!;
    expect(alias.value).toBe("{color.blue}");
  });
});

describe("dimensionToPx (ADR-0011)", () => {
  it("passes numbers through unchanged", () => {
    expect(dimensionToPx(16)).toBe(16);
    expect(dimensionToPx(0)).toBe(0);
  });
  it("accepts bare numeric strings", () => {
    expect(dimensionToPx("16")).toBe(16);
    expect(dimensionToPx("0.5")).toBe(0.5);
    expect(dimensionToPx("-4")).toBe(-4);
  });
  it("accepts px and drops the unit", () => {
    expect(dimensionToPx("16px")).toBe(16);
    expect(dimensionToPx("1.5px")).toBe(1.5);
    expect(dimensionToPx("16 px")).toBe(16);
  });
  it("converts rem and em using a 16px base", () => {
    expect(dimensionToPx("1rem")).toBe(16);
    expect(dimensionToPx("1.5rem")).toBe(24);
    expect(dimensionToPx("0.5em")).toBe(8);
    expect(dimensionToPx("1REM")).toBe(16);
  });
  it("rejects unsupported units and non-numeric input", () => {
    expect(dimensionToPx("1vw")).toBeNull();
    expect(dimensionToPx("auto")).toBeNull();
    expect(dimensionToPx("")).toBeNull();
    expect(dimensionToPx(NaN)).toBeNull();
    expect(dimensionToPx(undefined)).toBeNull();
  });
});

describe("parse — dimension normalisation routes through dimensionToPx", () => {
  it("converts rem-based dimension tokens to px", () => {
    const { tokens, warnings } = parseFiles([
      {
        path: "core/space.json",
        json: { space: { sm: { $type: "dimension", $value: "1rem" } } },
      },
    ]);
    expect(warnings).toEqual([]);
    expect(tokens).toEqual([
      { name: "space/sm", type: "dimension", value: 16, file: "core/space.json" },
    ]);
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
