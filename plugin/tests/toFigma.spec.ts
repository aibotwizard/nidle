import { describe, expect, it } from "vitest";
import { parseFiles } from "../src/shared/dtcg/parse.js";
import {
  collectionForFile,
  DEFAULT_SETTINGS,
  planForFiles,
  type FileTokens,
  type MappingSettings,
  type ValueSpec,
} from "../src/shared/mapping/toFigma.js";
import { fromUploads } from "../src/shared/intake/tokenIntake.js";
import type { RawUpload } from "../src/shared/intake/types.js";
import { loadFixtureUploads } from "./fixtures/loader.js";

function loadFixture(name: string): {
  uploads: RawUpload[];
  expected: any;
} {
  return loadFixtureUploads(name);
}

function fileTokens(uploads: RawUpload[]): FileTokens[] {
  return fromUploads(uploads).files;
}

function findMode(values: { mode: string; value: ValueSpec }[], mode: string) {
  return values.find((v) => v.mode === mode);
}

// ============================================================
// M2 — Aliases & themes
// ============================================================

describe("M2 — aliases & themes fixture (keepAlias)", () => {
  const { uploads, expected } = loadFixture("m2-aliases-themes");
  const fts = fileTokens(uploads);
  const plan = planForFiles(fts, { ...DEFAULT_SETTINGS, refMode: "keepAlias" });

  it("emits the expected total token count", () => {
    const total = fts.reduce((a, f) => a + f.tokens.length, 0);
    expect(total).toBe(expected.tokens);
  });

  it("splits themed Light/Dark files into Semantic-Color-Scheme with Light as default", () => {
    expect(plan.collections.map((c) => c.name)).toEqual([
      "Primitives",
      "Semantic-Color-Scheme",
    ]);
    const semantic = plan.collections.find((c) => c.name === "Semantic-Color-Scheme")!;
    // Exact order: the first mode becomes Figma's default mode.
    expect(semantic.modes).toEqual(["Light", "Dark"]);
  });

  it("each semantic variable carries one alias edge per mode", () => {
    for (const [name, spec] of Object.entries<any>(expected.semantic)) {
      const v = plan.variables.find(
        (x) => x.name === name && x.collection === "Semantic-Color-Scheme",
      );
      expect(v, `missing variable ${name}`).toBeDefined();
      for (const [mode, expectedAlias] of Object.entries<any>(spec.alias)) {
        const mv = findMode(v!.values, mode)!;
        expect(mv, `${name} missing mode ${mode}`).toBeDefined();
        expect(mv.value).toEqual({
          kind: "alias",
          targetCollection: expectedAlias.targetCollection,
          targetName: expectedAlias.targetName,
        });
      }
    }
  });

  it("emits no parse warnings on this fixture", () => {
    expect(plan.warnings).toEqual([]);
  });
});

describe("M2 — aliases & themes fixture (resolve mode)", () => {
  const { uploads, expected } = loadFixture("m2-aliases-themes");
  const fts = fileTokens(uploads);
  const plan = planForFiles(fts, { ...DEFAULT_SETTINGS, refMode: "resolve" });

  it("substitutes every alias with the chain-tip literal", () => {
    for (const [name, spec] of Object.entries<any>(expected.semantic)) {
      const v = plan.variables.find(
        (x) => x.name === name && x.collection === "Semantic-Color-Scheme",
      )!;
      for (const [mode, expectedLiteral] of Object.entries<any>(spec.resolved)) {
        const mv = findMode(v.values, mode)!;
        expect(mv.value).toEqual({ kind: "literal", value: expectedLiteral });
      }
    }
  });
});

// ============================================================
// M4 — Multi-collection layout + separator + update toggle
// ============================================================

describe("M4 — multi-collection fixture (default settings)", () => {
  const { uploads, expected } = loadFixture("m4-multi-collection");
  const fts = fileTokens(uploads);
  const plan = planForFiles(fts, DEFAULT_SETTINGS);

  it("emits the three expected collections, each with one mode", () => {
    const got = plan.collections.map((c) => ({
      name: c.name,
      modes: c.modes,
      variableCount: plan.variables.filter((v) => v.collection === c.name).length,
    }));
    expect(got).toEqual(expected.collections);
  });

  it("routes each token to its folder-derived collection", () => {
    for (const [name, spec] of Object.entries<any>(expected.byName)) {
      const v = plan.variables.find((x) => x.name === name);
      expect(v, `missing ${name}`).toBeDefined();
      expect(v!.collection).toBe(spec.collection);
      expect(v!.resolvedType).toBe(spec.type);
    }
  });

  it("cross-collection alias targets point at the correct collection", () => {
    for (const [name, spec] of Object.entries<any>(expected.byName)) {
      if (!spec.aliasName) continue;
      const v = plan.variables.find((x) => x.name === name)!;
      const mv = v.values[0]!;
      expect(mv.value).toEqual({
        kind: "alias",
        targetCollection: spec.aliasCollection,
        targetName: spec.aliasName,
      });
    }
  });

  it("literal-valued primitives carry their raw value", () => {
    for (const [name, spec] of Object.entries<any>(expected.byName)) {
      if (spec.literal === undefined) continue;
      const v = plan.variables.find((x) => x.name === name)!;
      expect(v.values[0]!.value).toEqual({ kind: "literal", value: spec.literal });
    }
  });
});

describe("M4 — separator setting", () => {
  const { uploads } = loadFixture("m4-multi-collection");
  const fts = fileTokens(uploads);

  it("emits dot-joined names when separator='dot'", () => {
    const plan = planForFiles(fts, { ...DEFAULT_SETTINGS, separator: "dot" });
    const v = plan.variables.find((x) => x.name === "surface.background")!;
    expect(v.collection).toBe("Semantic");
    expect(v.values[0]!.value).toEqual({
      kind: "alias",
      targetCollection: "Primitives",
      targetName: "color.gray.900",
    });
  });

  it("emits slash-joined names when separator='slash' (default)", () => {
    const plan = planForFiles(fts, DEFAULT_SETTINGS);
    expect(plan.variables.find((x) => x.name === "surface/background")).toBeDefined();
    expect(plan.variables.find((x) => x.name === "surface.background")).toBeUndefined();
  });
});

describe("M4 — updateExisting toggle threads through to the plan op marker", () => {
  const { uploads } = loadFixture("m4-multi-collection");
  const fts = fileTokens(uploads);

  it("op='createOrUpdate' when updateExisting=true", () => {
    const plan = planForFiles(fts, { ...DEFAULT_SETTINGS, updateExisting: true });
    expect(plan.variables.every((v) => v.op === "createOrUpdate")).toBe(true);
  });

  it("op='create' when updateExisting=false", () => {
    const plan = planForFiles(fts, { ...DEFAULT_SETTINGS, updateExisting: false });
    expect(plan.variables.every((v) => v.op === "create")).toBe(true);
  });
});

// ============================================================
// Semantic split (Jira OpenUI productionisation — AC 1.1 / 1.2 / 1.3)
// ============================================================

describe("semantic split — one collection per mode switcher", () => {
  const color = (hex: string) => ({ $type: "color", $value: hex });
  const uploads: RawUpload[] = [
    { path: "core/color.json", json: { blue: { "500": color("#0D99FF") } } },
    { path: "scheme/light.json", json: { bg: color("#FFFFFF") } },
    { path: "scheme/dark.json", json: { bg: color("#000000") } },
    { path: "appearance/desktop.json", json: { pad: { $type: "dimension", $value: "16px" } } },
    { path: "appearance/tablet.json", json: { pad: { $type: "dimension", $value: "24px" } } },
    { path: "device/mobile.json", json: { gap: { $type: "number", $value: 4 } } },
    { path: "device/widescreen.json", json: { gap: { $type: "number", $value: 8 } } },
    { path: "semantic/tokens.json", json: { accent: { $type: "color", $value: "{blue.500}" } } },
    { path: "component/button.json", json: { buttonBg: { $type: "color", $value: "{bg}" } } },
  ];
  const plan = planForFiles(fileTokens(uploads), DEFAULT_SETTINGS);
  const byName = (c: string) => plan.collections.find((x) => x.name === c);

  it("Light/Dark themed files become Semantic-Color-Scheme, Light default", () => {
    expect(byName("Semantic-Color-Scheme")?.modes).toEqual(["Light", "Dark"]);
  });

  it("Desktop/Tablet themed files become Semantic-Appearance, Desktop default", () => {
    expect(byName("Semantic-Appearance")?.modes).toEqual(["Desktop", "Tablet"]);
  });

  it("any other mode switcher splits dynamically, named from its directory", () => {
    expect(byName("Semantic-Device")?.modes.sort()).toEqual(["Mobile", "Widescreen"]);
  });

  it("non-themed semantic files stay in the plain Semantic collection", () => {
    expect(byName("Semantic")?.modes).toEqual(["Value"]);
    const accent = plan.variables.find((v) => v.name === "accent")!;
    expect(accent.collection).toBe("Semantic");
  });

  it("a singular component/ folder routes to Components", () => {
    const bg = plan.variables.find((v) => v.name === "buttonBg" && v.collection === "Components");
    expect(bg).toBeDefined();
  });

  it("alias targets use the split collection, not the semantic base", () => {
    const bg = plan.variables.find((v) => v.name === "buttonBg" && v.collection === "Components")!;
    expect(bg.values[0]!.value).toEqual({
      kind: "alias",
      targetCollection: "Semantic-Color-Scheme",
      targetName: "bg",
    });
  });

  it("emits collections in base order: Primitives, semantic splits, Components", () => {
    expect(plan.collections.map((c) => c.name)).toEqual([
      "Primitives",
      "Semantic-Color-Scheme",
      "Semantic-Appearance",
      "Semantic-Device",
      "Semantic",
      "Components",
    ]);
  });

  it("emits no warnings for this layout", () => {
    expect(plan.warnings).toEqual([]);
  });
});

describe("collectionForFile — folder routing", () => {
  it("routes core/* to Primitives (case-insensitive)", () => {
    expect(collectionForFile("core").collection).toBe("Primitives");
    expect(collectionForFile("core/color.json").collection).toBe("Primitives");
  });

  it("routes Tokens Studio semantic set names to Semantic", () => {
    for (const set of ["SchemeStatic/Light", "Scheme/Dark", "Device/Mobile", "Appearance/Compact", "Theme/Post", "Elements/Body", "Utilities/Color", "Helpers/Focus"]) {
      expect(collectionForFile(set).collection).toBe("Semantic");
    }
  });

  it("routes Components/* to Components (case-insensitive)", () => {
    expect(collectionForFile("Components/Button").collection).toBe("Components");
    expect(collectionForFile("components/button.json").collection).toBe("Components");
  });

  it("accepts the singular component/ folder too (AC 1.3)", () => {
    expect(collectionForFile("component/button.json").collection).toBe("Components");
    expect(collectionForFile("Component/Button").collection).toBe("Components");
  });

  it("routes Palette/* to Primitives", () => {
    expect(collectionForFile("Palette/Default").collection).toBe("Primitives");
  });

  it("falls back to Primitives with a warning for truly unknown folders", () => {
    const result = collectionForFile("Unknown/things");
    expect(result.collection).toBe("Primitives");
    expect(result.fallbackWarning).toBeDefined();
    expect(result.fallbackWarning!.reason).toMatch(/unknown top-level folder/);
  });

  it("no warning for flat single-file paths (no slash)", () => {
    const result = collectionForFile("tokens");
    expect(result.collection).toBe("Primitives");
    expect(result.fallbackWarning).toBeUndefined();
  });
});

describe("M4 — unknown top-level folder", () => {
  it("falls back to Primitives with a warning", () => {
    const settings: MappingSettings = { ...DEFAULT_SETTINGS };
    const fts: FileTokens[] = [
      {
        file: "weird/things.json",
        tokens: parseFiles([
          {
            path: "weird/things.json",
            json: { x: { y: { $type: "color", $value: "#FF0000" } } },
          },
        ]).tokens,
      },
    ];
    const plan = planForFiles(fts, settings);
    expect(plan.collections.map((c) => c.name)).toEqual(["Primitives"]);
    expect(plan.warnings.some((w) => /unknown top-level folder/.test(w.reason))).toBe(true);
  });
});

// ============================================================
// req-0005 / ADR-0015 — tolerant theme matching
// ============================================================

describe("tolerant theme matching — sibling files with shape drift", () => {
  const color = (hex: string) => ({ $type: "color", $value: hex });
  // Light has one token Dark lacks; shared shape is 2/2 of the smallest file.
  const uploads: RawUpload[] = [
    {
      path: "scheme/light.json",
      json: { bg: color("#FFFFFF"), fg: color("#000000"), inputBg: color("#EEEEEE") },
    },
    { path: "scheme/dark.json", json: { bg: color("#000000"), fg: color("#FFFFFF") } },
  ];
  const plan = planForFiles(fileTokens(uploads), DEFAULT_SETTINGS);

  it("still folds drifted siblings into one themed collection", () => {
    const c = plan.collections.find((x) => x.name === "Semantic-Color-Scheme");
    expect(c?.modes).toEqual(["Light", "Dark"]);
    expect(plan.variables).toHaveLength(3);
  });

  it("fills a token's missing mode from the default mode and warns", () => {
    const op = plan.variables.find((v) => v.name === "inputBg")!;
    expect(findMode(op.values, "Dark")?.value).toEqual(
      findMode(op.values, "Light")?.value,
    );
    expect(
      plan.warnings.some(
        (w) => w.path === "inputBg" && /filled from mode "Light"/.test(w.reason),
      ),
    ).toBe(true);
  });

  it("keeps disjoint sibling files as singles", () => {
    const disjoint: RawUpload[] = [
      { path: "elements/body.json", json: { bodyFg: color("#111111") } },
      { path: "elements/link.json", json: { linkFg: color("#0D99FF") } },
    ];
    const p = planForFiles(fileTokens(disjoint), DEFAULT_SETTINGS);
    expect(p.collections.map((c) => c.name)).toEqual(["Semantic"]);
    expect(p.collections[0]!.modes).toEqual(["Value"]);
    expect(p.warnings).toEqual([]);
  });

  it("keeps siblings sharing less than half the smallest file's shape as singles", () => {
    const low: RawUpload[] = [
      { path: "utilities/spacing.json", json: { a: color("#111111"), b: color("#222222"), c: color("#333333") } },
      { path: "utilities/border.json", json: { a: color("#444444"), x: color("#555555"), y: color("#666666") } },
    ];
    const p = planForFiles(fileTokens(low), DEFAULT_SETTINGS);
    expect(p.collections[0]!.modes).toEqual(["Value"]);
  });
});

describe("duplicate token names in the same mode warn instead of silently overwriting", () => {
  const color = (hex: string) => ({ $type: "color", $value: hex });
  // Different directories → separate groups, but both route to Semantic,
  // so both land in mode "Value" under the same variable name.
  const uploads: RawUpload[] = [
    { path: "semantic/base/a.json", json: { accent: color("#111111") } },
    { path: "semantic/extra/b.json", json: { accent: color("#222222") } },
  ];
  const plan = planForFiles(fileTokens(uploads), DEFAULT_SETTINGS);

  it("keeps the first definition and warns about the second", () => {
    const op = plan.variables.find((v) => v.name === "accent")!;
    expect(op.values).toHaveLength(1);
    expect(op.values[0]!.value).toEqual({ kind: "literal", value: "#111111" });
    expect(
      plan.warnings.some(
        (w) => w.file === "semantic/extra/b.json" && /first definition wins/.test(w.reason),
      ),
    ).toBe(true);
  });
});

// ============================================================
// req-0005 / ADR-0015 — Tokens Studio combined-export fixture
// ============================================================

describe("tokens-studio fixture — combined export end to end", () => {
  const { uploads, expected } = loadFixture("tokens-studio");
  const intake = fromUploads(uploads);
  const plan = planForFiles(intake.files, DEFAULT_SETTINGS);

  it("expands the combined file and parses the expected token count", () => {
    const total = intake.files.reduce((n, f) => n + f.tokens.length, 0);
    expect(total).toBe(expected.tokens);
  });

  it("produces the expected collections, modes, and variable counts", () => {
    expect(
      plan.collections.map((c) => ({
        name: c.name,
        modes: c.modes,
        variableCount: plan.variables.filter((v) => v.collection === c.name).length,
      })),
    ).toEqual(expected.collections);
  });

  it("keeps cross-set aliases pointing at their final collection", () => {
    const fg = plan.variables.find((v) => v.name === "post/scheme/color/fg")!;
    expect(findMode(fg.values, "Light")?.value).toEqual({
      kind: "alias",
      targetCollection: "Primitives",
      targetName: "post/core/color/black",
    });
  });

  it("plans text tokens as STRING variables", () => {
    const name = plan.variables.find((v) => v.name === "post/core/scheme-name")!;
    expect(name.resolvedType).toBe("STRING");
    expect(name.values[0]!.value).toEqual({ kind: "literal", value: "light" });
  });

  it("surfaces every drop or fill in warnings — nothing silent", () => {
    const reasons = [...intake.warnings, ...plan.warnings].map((w) => w.reason);
    expect(reasons.some((r) => /Tokens Studio combined export/.test(r))).toBe(true);
    expect(reasons.some((r) => /dimension value must be/.test(r))).toBe(true);
    expect(reasons.some((r) => /filled from mode "Light"/.test(r))).toBe(true);
  });
});
