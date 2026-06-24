import { describe, expect, it } from "vitest";
import { parseFiles } from "../src/shared/dtcg/parse.js";
import {
  DEFAULT_SETTINGS,
  planForFiles,
} from "../src/shared/mapping/toFigma.js";
import { write } from "../src/shared/writer/variableWriter.js";
import { createInMemoryFigmaApi } from "../src/shared/writer/inMemoryFigmaApi.js";
import type { WriteProgress } from "../src/shared/writer/types.js";
import { fromUploads } from "../src/shared/intake/tokenIntake.js";
import { loadFixtureUploads } from "./fixtures/loader.js";

function loadFixture(name: string) {
  const { uploads } = loadFixtureUploads(name);
  return fromUploads(uploads).files;
}

describe("VariableWriter — m1-primitives end-to-end", () => {
  const fts = loadFixture("m1-primitives");
  const plan = planForFiles(fts, DEFAULT_SETTINGS);

  it("creates one Primitives collection with one Value mode", async () => {
    const api = createInMemoryFigmaApi();
    await write(plan, api);
    expect(api.collections).toHaveLength(1);
    expect(api.collections[0]!.name).toBe("Primitives");
    expect(api.collections[0]!.modes.map((m) => m.name)).toEqual(["Value"]);
  });

  it("creates one variable per token and reports the count", async () => {
    const api = createInMemoryFigmaApi();
    const report = await write(plan, api);
    expect(api.variables).toHaveLength(plan.variables.length);
    expect(report.created).toBe(plan.variables.length);
    expect(report.updated).toBe(0);
    expect(report.errors).toEqual([]);
  });

  it("coerces hex colors into Figma's {r,g,b,a} 0–1 floats", async () => {
    const api = createInMemoryFigmaApi();
    await write(plan, api);
    const value = api.read("Primitives", "color/blue/500", "Value");
    expect(value).toMatchObject({
      r: 13 / 255,
      g: 153 / 255,
      b: 255 / 255,
      a: 1,
    });
  });

  it("passes numbers through unchanged", async () => {
    const api = createInMemoryFigmaApi();
    await write(plan, api);
    const value = api.read("Primitives", "space/200", "Value");
    expect(value).toBe(16);
  });
});

describe("VariableWriter — idempotent upsert (ADR-0004)", () => {
  const fts = loadFixture("m1-primitives");
  const plan = planForFiles(fts, DEFAULT_SETTINGS);

  it("does not duplicate variables on re-run; reports them as updated", async () => {
    const api = createInMemoryFigmaApi();
    const first = await write(plan, api);
    const second = await write(plan, api);
    expect(api.variables.length).toBe(plan.variables.length);
    expect(first.created).toBe(plan.variables.length);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(plan.variables.length);
  });

  it("does not duplicate the Primitives collection on re-run", async () => {
    const api = createInMemoryFigmaApi();
    await write(plan, api);
    await write(plan, api);
    expect(api.collections).toHaveLength(1);
  });
});

describe("VariableWriter — updateExisting=false refuses to overwrite", () => {
  const fts = loadFixture("m1-primitives");

  it("errors per variable when op='create' and variable already exists", async () => {
    const planUpsert = planForFiles(fts, DEFAULT_SETTINGS);
    const planCreate = planForFiles(fts, {
      ...DEFAULT_SETTINGS,
      updateExisting: false,
    });
    const api = createInMemoryFigmaApi();
    await write(planUpsert, api);
    const report = await write(planCreate, api);
    expect(report.created).toBe(0);
    expect(report.updated).toBe(0);
    expect(report.errors.length).toBe(planCreate.variables.length);
    expect(report.errors[0]!.reason).toMatch(/already exists/);
  });
});

describe("VariableWriter — M2 aliases & themes", () => {
  const fts = loadFixture("m2-aliases-themes");
  const plan = planForFiles(fts, {
    ...DEFAULT_SETTINGS,
    refMode: "keepAlias",
  });

  it("creates Primitives + Semantic collections; Semantic carries Light + Dark modes", async () => {
    const api = createInMemoryFigmaApi();
    await write(plan, api);
    expect(api.collections.map((c) => c.name).sort()).toEqual([
      "Primitives",
      "Semantic",
    ]);
    const semantic = api.collections.find((c) => c.name === "Semantic")!;
    expect(semantic.modes.map((m) => m.name).sort()).toEqual(["Dark", "Light"]);
  });

  it("writes an alias edge per mode, pointing at the target variable's handle", async () => {
    const api = createInMemoryFigmaApi();
    await write(plan, api);
    const aliasOps = plan.variables.filter((v) =>
      v.values.some((mv) => mv.value.kind === "alias"),
    );
    expect(aliasOps.length).toBeGreaterThan(0);
    for (const op of aliasOps) {
      for (const mv of op.values) {
        if (mv.value.kind !== "alias") continue;
        const written = api.read(op.collection, op.name, mv.mode);
        expect(written, `${op.name} mode ${mv.mode}`).toBeDefined();
        expect((written as { kind: string }).kind).toBe("alias");
        const target = (written as {
          variableHandle: { name: string; collectionId: string };
        }).variableHandle;
        expect(target.name).toBe(mv.value.targetName);
        const targetCol = api.collections.find(
          (c) => c.id === target.collectionId,
        );
        expect(targetCol?.name).toBe(mv.value.targetCollection);
      }
    }
  });

  it("dangling aliases produce an error and are skipped", async () => {
    // Build a tiny plan with a known-missing alias target.
    const planWithDangler = planForFiles(
      [
        {
          file: "core/color.json",
          tokens: parseFiles([
            {
              path: "core/color.json",
              json: { color: { red: { $type: "color", $value: "#FF0000" } } },
            },
          ]).tokens,
        },
        {
          file: "semantic/tokens.json",
          tokens: parseFiles([
            {
              path: "semantic/tokens.json",
              json: { bg: { $type: "color", $value: "{color.does.not.exist}" } },
            },
          ]).tokens,
        },
      ],
      DEFAULT_SETTINGS,
    );
    const api = createInMemoryFigmaApi();
    const report = await write(planWithDangler, api);
    // The resolver already dropped the dangler with a warning. Writer
    // sees a clean plan and writes the literal-only Primitive.
    expect(report.created).toBe(1);
    expect(planWithDangler.warnings.some((w) => /does not match/.test(w.reason))).toBe(true);
  });
});

describe("VariableWriter — progress streaming (ADR-0010)", () => {
  const fts = loadFixture("m1-primitives");
  const plan = planForFiles(fts, DEFAULT_SETTINGS);

  it("calls onProgress at least once and reaches 100% at the end", async () => {
    const events: WriteProgress[] = [];
    const api = createInMemoryFigmaApi();
    await write(plan, api, { onProgress: (p) => events.push(p) });
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]!.pct).toBe(100);
  });

  it("emits progress events incrementally, not all at the end", async () => {
    // The async yield in writeValues lets onProgress callers observe the
    // mid-import state. If the writer were sync, the array would only
    // grow after `await write` returns.
    const events: WriteProgress[] = [];
    const api = createInMemoryFigmaApi();
    const promise = write(plan, api, { onProgress: (p) => events.push(p) });
    // Yield once: setupCollections + first writeValues tick should run,
    // so we expect at least the "Preparing…" + one "Wrote N/M" event.
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[events.length - 1]!.pct).toBeLessThan(100);
    await promise;
  });
});

describe("VariableWriter — pre-existing Figma state", () => {
  const fts = loadFixture("m1-primitives");
  const plan = planForFiles(fts, DEFAULT_SETTINGS);

  it("reuses an existing Primitives collection rather than creating a duplicate", async () => {
    const api = createInMemoryFigmaApi({
      collections: [{ name: "Primitives", modes: ["Value"] }],
    });
    await write(plan, api);
    expect(api.collections.filter((c) => c.name === "Primitives")).toHaveLength(1);
  });

  it("renames the initial mode when the plan's first mode differs", async () => {
    const api = createInMemoryFigmaApi({
      collections: [{ name: "Semantic", modes: ["OldMode"] }],
    });
    const themed = loadFixture("m2-aliases-themes");
    const themedPlan = planForFiles(themed, DEFAULT_SETTINGS);
    await write(themedPlan, api);
    const semantic = api.collections.find((c) => c.name === "Semantic")!;
    expect(semantic.modes.map((m) => m.name).sort()).toEqual(["Dark", "Light"]);
  });
});
