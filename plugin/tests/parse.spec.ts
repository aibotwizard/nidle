import { describe, it, expect } from "vitest";
import {
  expandTokensStudio,
  parseFiles,
  dimensionToPx,
  durationToMs,
  fontWeightToNumber,
} from "../src/shared/dtcg/parse.js";
import { planForFiles } from "../src/shared/mapping/toFigma.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings/defaults.js";
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

describe("DTCG 2025.10 object-form dimensions", () => {
  const leaf = (value: unknown) =>
    parseFiles([
      { path: "core/rest.json", json: { fs: { $type: "dimension", $value: value } } },
    ]);

  it("dimensionToPx accepts { value, unit }", () => {
    expect(dimensionToPx({ value: 0.75, unit: "rem" })).toBe(12);
    expect(dimensionToPx({ value: 2, unit: "px" })).toBe(2);
    expect(dimensionToPx({ value: 150, unit: "%" })).toBe(1.5);
  });

  it("parses the object form without a warning", () => {
    const r = leaf({ value: 0.75, unit: "rem" });
    expect(r.warnings).toEqual([]);
    expect(r.tokens[0]!.value).toBe(12);
  });

  it("rejects an object without a numeric value or a string unit", () => {
    expect(dimensionToPx({ value: "0.75", unit: "rem" })).toBeNull();
    expect(leaf({ value: 0.75 }).tokens).toEqual([]);
    expect(leaf({ value: 0.75 }).warnings[0]!.reason).toMatch(/dimension value must be/);
  });

  it("keeps a negated alias verbatim for the resolver (D-14)", () => {
    // Only the resolver can look up the value being negated, so the parser
    // passes the expression through untouched, exactly like a plain alias.
    const r = leaf("-{sizes.8}");
    expect(r.warnings).toEqual([]);
    expect(r.tokens[0]).toMatchObject({ type: "dimension", value: "-{sizes.8}" });
  });
});

describe("DTCG composite types split into their members (ADR-0021)", () => {
  const leaf = (type: string, value: unknown) =>
    parseFiles([{ path: "core/t.json", json: { t: { $type: type, $value: value } } }]);

  it("splits a border into color, width, and style", () => {
    const r = leaf("border", {
      color: "{color.border.error.default}",
      width: "{sizes.2}",
      style: "solid",
    });
    expect(r.tokens).toEqual([
      {
        name: "t/color",
        type: "color",
        value: "{color.border.error.default}",
        file: "core/t.json",
      },
      { name: "t/width", type: "dimension", value: "{sizes.2}", file: "core/t.json" },
      { name: "t/style", type: "text", value: "solid", file: "core/t.json" },
    ]);
    // The split is a notice, not a drop: three variables now exist.
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({ level: "notice", path: "t" });
    expect(r.warnings[0]!.reason).toContain("border split into 3 variables");
  });

  it("splits a transition, kebab-casing timingFunction", () => {
    const r = leaf("transition", {
      duration: { value: 175, unit: "ms" },
      delay: { value: 100, unit: "ms" },
      timingFunction: [0.25, 0.1, 0.25, 1],
    });
    expect(
      Object.fromEntries(r.tokens.map((t) => [t.name, { type: t.type, value: t.value }])),
    ).toEqual({
      "t/duration": { type: "number", value: 175 },
      "t/delay": { type: "number", value: 100 },
      "t/timing-function": { type: "text", value: "cubic-bezier(0.25, 0.1, 0.25, 1)" },
    });
  });

  it("reports a member it cannot create and keeps the rest", () => {
    const r = leaf("border", { color: "#FF0000", style: "solid" });
    expect(r.tokens.map((t) => t.name)).toEqual(["t/color", "t/style"]);
    expect(r.warnings.some((w) => /border has no "width"/.test(w.reason))).toBe(true);
  });

  it("refuses an alias to a whole composite — only members can be aliased", () => {
    const r = leaf("border", "{border.default}");
    expect(r.tokens).toEqual([]);
    expect(r.warnings[0]!.reason).toContain("a composite cannot be aliased");
    expect(r.warnings[0]!.level).toBeUndefined();
  });

  it("emits a cubicBezier as one CSS-usable STRING", () => {
    const r = leaf("cubicBezier", [0.25, 0.1, 0.25, 1]);
    expect(r.warnings).toEqual([]);
    expect(r.tokens[0]).toMatchObject({
      type: "text",
      value: "cubic-bezier(0.25, 0.1, 0.25, 1)",
    });
  });

  it("warns on a cubicBezier that is not four numbers", () => {
    const r = leaf("cubicBezier", [0.25, 0.1]);
    expect(r.tokens).toEqual([]);
    expect(r.warnings[0]!.reason).toContain("four finite numbers");
  });
});

describe("DTCG scalar types folded onto number (ADR-0019)", () => {
  const leaf = (type: string, value: unknown) =>
    parseFiles([{ path: "core/rest.json", json: { t: { $type: type, $value: value } } }]);

  it("maps numeric and keyword font weights to FLOAT-ready numbers", () => {
    expect(fontWeightToNumber("300")).toBe(300);
    expect(fontWeightToNumber(700)).toBe(700);
    expect(fontWeightToNumber("Bold")).toBe(700);
    expect(fontWeightToNumber("extra-light")).toBe(200);
    expect(fontWeightToNumber("chunky")).toBeNull();
    const r = leaf("fontWeight", "300");
    expect(r.warnings).toEqual([]);
    expect(r.tokens[0]).toMatchObject({ type: "number", value: 300 });
  });

  it("warns on a font weight that is neither numeric nor a keyword", () => {
    const r = leaf("fontWeight", "chunky");
    expect(r.tokens).toEqual([]);
    expect(r.warnings[0]!.reason).toMatch(/font weight must be/);
  });

  it("stores durations in milliseconds, string or object form", () => {
    expect(durationToMs("175ms")).toBe(175);
    expect(durationToMs("0.2s")).toBe(200);
    expect(durationToMs({ value: 175, unit: "ms" })).toBe(175);
    expect(durationToMs("175 frames")).toBeNull();
    const r = leaf("duration", { value: 175, unit: "ms" });
    expect(r.warnings).toEqual([]);
    expect(r.tokens[0]).toMatchObject({ type: "number", value: 175 });
  });

  it("warns on a duration outside the grammar", () => {
    const r = leaf("duration", "quick");
    expect(r.tokens).toEqual([]);
    expect(r.warnings[0]!.reason).toMatch(/duration value must be/);
  });

  it("keeps aliases on both folded types", () => {
    expect(leaf("fontWeight", "{font.font-weight.light}").tokens[0]).toMatchObject({
      type: "number",
      value: "{font.font-weight.light}",
    });
    expect(leaf("duration", "{duration-default}").tokens[0]!.value).toBe(
      "{duration-default}",
    );
  });

  it("reads a percent on a number as a fraction, like a dimension (D-11)", () => {
    const r = leaf("number", "0.12%");
    expect(r.tokens[0]!.value).toBeCloseTo(0.0012);
    expect(r.warnings[0]!.reason).toContain("percent treated as a fraction");
  });
});

describe("DTCG scalar types folded onto text (ADR-0019)", () => {
  const leaf = (type: string, value: unknown) =>
    parseFiles([{ path: "core/rest.json", json: { t: { $type: type, $value: value } } }]);

  it("maps fontFamily, fontStyle, and strokeStyle to STRING-ready text", () => {
    for (const [type, value] of [
      ["fontFamily", "PostFinance Grotesk"],
      ["fontStyle", "italic"],
      ["strokeStyle", "solid"],
    ] as const) {
      const r = leaf(type, value);
      expect(r.warnings, type).toEqual([]);
      expect(r.tokens[0], type).toMatchObject({ type: "text", value });
    }
  });

  it("flattens a font stack to its first family", () => {
    const single = leaf("fontFamily", ["PostFinance Grotesk"]);
    expect(single.warnings).toEqual([]);
    expect(single.tokens[0]!.value).toBe("PostFinance Grotesk");

    const stack = leaf("fontFamily", ["Grotesk", "Helvetica", "sans-serif"]);
    expect(stack.tokens[0]!.value).toBe("Grotesk");
    expect(stack.warnings[0]!.reason).toContain("font stack flattened");
  });

  it("preserves an alias nested inside a font stack", () => {
    const r = leaf("fontFamily", ["{font.font-family.swiss-post}"]);
    expect(r.warnings).toEqual([]);
    expect(r.tokens[0]!.value).toBe("{font.font-family.swiss-post}");
  });
});

describe("Tokens Studio metadata sidecars", () => {
  it("skips $metadata.json / $themes.json without warning", () => {
    const { tokens, warnings } = parseFiles([
      { path: "$metadata.json", json: { tokenSetOrder: ["core"] } },
      { path: "$themes.json", json: [{ id: "a", name: "Light" }] },
      { path: "core/c.json", json: { c: { $type: "color", $value: "#fff" } } },
    ]);
    expect(warnings).toEqual([]);
    expect(tokens.map((t) => t.name)).toEqual(["c"]);
  });
});
