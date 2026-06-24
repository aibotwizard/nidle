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

  it("emits one Primitives + one Semantic collection, with Semantic having Light + Dark modes", () => {
    expect(plan.collections.map((c) => c.name)).toEqual(["Primitives", "Semantic"]);
    const semantic = plan.collections.find((c) => c.name === "Semantic")!;
    expect(semantic.modes.sort()).toEqual(["Dark", "Light"]);
  });

  it("each semantic variable carries one alias edge per mode", () => {
    for (const [name, spec] of Object.entries<any>(expected.semantic)) {
      const v = plan.variables.find(
        (x) => x.name === name && x.collection === "Semantic",
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
        (x) => x.name === name && x.collection === "Semantic",
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
