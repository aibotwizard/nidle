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

// ============================================================
// req-0003 — honest diagnostics (D-3 / D-6)
// ============================================================

describe("number values — strict grammar (D-6)", () => {
  const parse = (value: unknown) =>
    parseFiles([{ path: "core/n.json", json: { n: { $type: "number", $value: value } } }]);

  it("accepts JSON numbers and clean numeric strings", () => {
    expect(parse(4).tokens[0]!.value).toBe(4);
    expect(parse("4.5").tokens[0]!.value).toBe(4.5);
    expect(parse(" -2 ").tokens[0]!.value).toBe(-2);
  });

  it("rejects trailing garbage instead of silently truncating it", () => {
    const r = parse("12abc");
    expect(r.tokens).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.reason).toMatch(/number value must be numeric/);
  });
});

describe("em dimensions surface their conversion (D-3)", () => {
  const dim = (value: unknown) =>
    parseFiles([{ path: "core/d.json", json: { pad: { $type: "dimension", $value: value } } }]);

  it("keeps the token but logs the em→px conversion", () => {
    const r = dim("1.5em");
    expect(r.tokens[0]!.value).toBe(24);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.reason).toContain('em treated as rem: "1.5em" → 24px');
  });

  it("rem and px stay silent", () => {
    expect(dim("1rem").warnings).toEqual([]);
    expect(dim("16px").warnings).toEqual([]);
  });
});

describe("Tokens Studio numeric $type mapping (req-0005 / ADR-0015)", () => {
  const leaf = (type: string, value: unknown) =>
    parseFiles([{ path: "core/t.json", json: { tok: { $type: type, $value: value } } }]);

  it("maps spacing/sizing/borderRadius/borderWidth/fontSizes/fontWeights/lineHeights/letterSpacing to dimension", () => {
    for (const type of [
      "spacing",
      "sizing",
      "borderRadius",
      "borderWidth",
      "fontSizes",
      "fontWeights",
      "lineHeights",
      "letterSpacing",
    ]) {
      const r = leaf(type, "16px");
      expect(r.warnings, type).toEqual([]);
      expect(r.tokens[0]!.type, type).toBe("dimension");
      expect(r.tokens[0]!.value, type).toBe(16);
    }
  });

  it("preserves alias values on mapped types", () => {
    const r = leaf("sizing", "{core.size.md}");
    expect(r.tokens[0]!).toMatchObject({ type: "dimension", value: "{core.size.md}" });
  });

  it("values outside the dimension grammar still warn and drop (D-4)", () => {
    const r = leaf("spacing", "auto");
    expect(r.tokens).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.reason).toMatch(/dimension value must be/);
  });

  it("composite types remain unsupported with a warning", () => {
    for (const type of ["boxShadow", "typography"]) {
      const r = leaf(type, "x");
      expect(r.tokens, type).toEqual([]);
      expect(r.warnings[0]!.reason, type).toMatch(/unsupported \$type/);
    }
  });
});

describe("Tokens Studio string $type mapping (ADR-0016)", () => {
  const leaf = (type: string, value: unknown) =>
    parseFiles([{ path: "core/t.json", json: { tok: { $type: type, $value: value } } }]);

  it("maps text/fontFamilies/textDecoration/other to the text type", () => {
    for (const type of ["text", "fontFamilies", "textDecoration", "other"]) {
      const r = leaf(type, "Swiss Post Sans");
      expect(r.warnings, type).toEqual([]);
      expect(r.tokens[0]!.type, type).toBe("text");
      expect(r.tokens[0]!.value, type).toBe("Swiss Post Sans");
    }
  });

  it("keeps empty strings and preserves aliases", () => {
    expect(leaf("other", "").tokens[0]!.value).toBe("");
    expect(leaf("text", "{post.theme.scheme}").tokens[0]!.value).toBe(
      "{post.theme.scheme}",
    );
  });

  it("warns and drops non-string values", () => {
    const r = leaf("text", 42);
    expect(r.tokens).toEqual([]);
    expect(r.warnings[0]!.reason).toMatch(/text value must be a string/);
  });
});

describe("percent dimensions convert to fractions (ADR-0016)", () => {
  it("dimensionToPx converts % by dividing by 100", () => {
    expect(dimensionToPx("150%")).toBe(1.5);
    expect(dimensionToPx("100%")).toBe(1);
    expect(dimensionToPx("0.12%")).toBeCloseTo(0.0012);
  });

  it("keeps the token and surfaces the conversion", () => {
    const r = parseFiles([
      {
        path: "core/t.json",
        json: { lh: { $type: "lineHeights", $value: "150%" } },
      },
    ]);
    expect(r.tokens[0]!.value).toBe(1.5);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.reason).toContain('percent treated as a fraction: "150%" → 1.5');
  });
});

describe("DTCG $type inheritance (spec §5.2.2 / §6.3)", () => {
  it("inherits $type from the closest ancestor group", () => {
    const { tokens, warnings } = parseFiles([
      {
        path: "core/sizes.json",
        json: {
          sizes: {
            $type: "dimension",
            "1": { $value: "1px" },
            nested: { "4": { $value: "4px" } },
          },
        },
      },
    ]);
    expect(warnings).toEqual([]);
    expect(
      Object.fromEntries(tokens.map((t) => [t.name, { type: t.type, value: t.value }])),
    ).toEqual({
      "sizes/1": { type: "dimension", value: 1 },
      "sizes/nested/4": { type: "dimension", value: 4 },
    });
  });

  it("inherits $type declared at the file root", () => {
    const { tokens } = parseFiles([
      { path: "core/x.json", json: { $type: "number", ratio: { $value: 1.5 } } },
    ]);
    expect(tokens).toEqual([
      { name: "ratio", type: "number", value: 1.5, file: "core/x.json" },
    ]);
  });

  it("lets a token's own $type override the inherited one", () => {
    const { tokens } = parseFiles([
      {
        path: "core/x.json",
        json: {
          grp: { $type: "dimension", label: { $type: "text", $value: "hi" } },
        },
      },
    ]);
    expect(tokens[0]).toMatchObject({ name: "grp/label", type: "text" });
  });

  it("warns instead of silently dropping when no $type can be determined", () => {
    const { tokens, warnings } = parseFiles([
      { path: "core/x.json", json: { orphan: { $value: "4px" } } },
    ]);
    expect(tokens).toEqual([]);
    expect(warnings).toEqual([
      {
        file: "core/x.json",
        path: "orphan",
        reason: "no $type on the token or any ancestor group — type cannot be determined",
      },
    ]);
  });

  it("warns per token when the inherited $type is unsupported", () => {
    const { tokens, warnings } = parseFiles([
      {
        path: "core/x.json",
        json: { sh: { $type: "shadow", a: { $value: "x" }, b: { $value: "y" } } },
      },
    ]);
    expect(tokens).toEqual([]);
    expect(warnings.map((w) => w.path)).toEqual(["sh/a", "sh/b"]);
    expect(warnings[0].reason).toContain('unsupported $type "shadow"');
  });
});

describe("DTCG untyped alias tokens (spec §5.2.2 rule 1)", () => {
  it("defers $type to the alias target when nothing declares one", () => {
    const { tokens, warnings } = parseFiles([
      {
        path: "component/btn.json",
        json: { btn: { "border-width": { $value: "{sizes.1}" } } },
      },
    ]);
    expect(warnings).toEqual([]);
    expect(tokens).toEqual([
      {
        name: "btn/border-width",
        type: null,
        value: "{sizes.1}",
        file: "component/btn.json",
      },
    ]);
  });
});
