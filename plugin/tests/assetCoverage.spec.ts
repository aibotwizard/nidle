import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fromUploads } from "../src/shared/intake/tokenIntake.js";
import { planForFiles } from "../src/shared/mapping/toFigma.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";
import type { ResolveMode } from "../src/shared/dtcg/resolve.js";
import type { RawUpload } from "../src/shared/intake/types.js";
import { write } from "../src/shared/writer/variableWriter.js";
import { createInMemoryFigmaApi } from "../src/shared/writer/inMemoryFigmaApi.js";

/**
 * Whole-corpus coverage gate for the two real token sets shipped in
 * `assets/`: every DTCG leaf in the source must reach Figma as a
 * variable, or appear in this file's `skips` list with a reason.
 *
 * This is the "nothing silently dropped" claim of constitution §3.2,
 * asserted against production data rather than a hand-built fixture —
 * the m1/m2/m4 fixtures cover mechanics, this covers completeness.
 */

const ROOT = join(__dirname, "..", "..", "assets");

function loadDir(dir: string): RawUpload[] {
  const out: RawUpload[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const full = join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (e.endsWith(".json")) {
        out.push({
          path: relative(dir, full).split(/[/\\]/).join("/"),
          json: JSON.parse(readFileSync(full, "utf8")),
        });
      }
    }
  };
  walk(dir);
  return out;
}

/** Every `$value`-bearing node in the source, as `file::a/b/c`. */
function sourceLeaves(uploads: RawUpload[]): string[] {
  const out: string[] = [];
  const walk = (node: unknown, file: string, trail: string[]) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if ("$value" in (node as object)) {
      out.push(`${file}::${trail.join("/")}`);
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith("$")) continue;
      walk(v, file, [...trail, k]);
    }
  };
  for (const u of uploads) {
    // `$metadata.json` / `$themes.json` carry no tokens.
    if (u.path.slice(u.path.lastIndexOf("/") + 1).startsWith("$")) continue;
    walk(u.json, u.path, []);
  }
  return out;
}

type Corpus = {
  dir: string;
  /** Leaves that legitimately do not become variables, with the reason. */
  skips: Record<string, string>;
  /** Composite leaves and the sub-token names they must expand into. */
  composites?: Record<string, string[]>;
  expected: { leaves: number; tokens: number; variables: number };
  collections: { name: string; modes: string[] }[];
};

const CORPORA: Corpus[] = [
  {
    dir: "base",
    // Nothing is dropped any more: composites split into their members
    // (ADR-0021) and the negated alias resolves to a literal (D-14).
    skips: {},
    composites: {
      "core/rest.json::transition-default": [
        "transition-default/duration",
        "transition-default/delay",
        "transition-default/timing-function",
      ],
      "component/form-control.json::form-control/recommended/marker/border": [
        "form-control/recommended/marker/border/color",
        "form-control/recommended/marker/border/width",
        "form-control/recommended/marker/border/style",
      ],
    },
    // 744 leaves → 748 tokens: two composites become three members each.
    expected: { leaves: 744, tokens: 748, variables: 604 },
    collections: [
      { name: "Primitives", modes: ["Value"] },
      { name: "Semantic-Appearance", modes: ["Desktop", "Tablet"] },
      { name: "Semantic", modes: ["Value"] },
      { name: "Semantic-Color-Scheme", modes: ["Light", "Dark"] },
      { name: "Components", modes: ["Value"] },
    ],
  },
  {
    dir: "w3c-tokens",
    skips: {},
    expected: { leaves: 134, tokens: 134, variables: 134 },
    collections: [
      { name: "Primitives", modes: ["Value"] },
      { name: "Semantic", modes: ["Value"] },
      { name: "Components", modes: ["Value"] },
    ],
  },
];

for (const corpus of CORPORA) {
  // `assets/base` is not checked in, so it is absent on CI; skip it
  // visibly instead of failing the whole file at collection time.
  if (!existsSync(join(ROOT, corpus.dir))) {
    it.skip(`assets/${corpus.dir} — full corpus coverage (corpus not present)`, () => {});
    continue;
  }
  describe(`assets/${corpus.dir} — full corpus coverage`, () => {
    const uploads = loadDir(join(ROOT, corpus.dir));
    const leaves = sourceLeaves(uploads);
    const intake = fromUploads(uploads);
    const parsed = new Set(
      intake.files.flatMap((f) => f.tokens.map((t) => `${f.file}::${t.name}`)),
    );

    it("parses every source leaf except the documented skips", () => {
      // A composite leaf is covered by its member tokens, which are named
      // under it — `…/border` by `…/border/color` and siblings.
      const covers = (leaf: string) =>
        parsed.has(leaf) || [...parsed].some((p) => p.startsWith(`${leaf}/`));
      const unparsed = leaves.filter((l) => !covers(l));
      expect(unparsed.sort()).toEqual(Object.keys(corpus.skips).sort());
      expect(leaves).toHaveLength(corpus.expected.leaves);
      expect(parsed.size).toBe(corpus.expected.tokens);
    });

    it("expands each composite leaf into one token per member", () => {
      for (const [leaf, members] of Object.entries(corpus.composites ?? {})) {
        const file = leaf.split("::")[0]!;
        expect(members.map((m) => `${file}::${m}`).every((k) => parsed.has(k)), leaf).toBe(
          true,
        );
      }
    });

    for (const refMode of ["keepAlias", "resolve"] as ResolveMode[]) {
      describe(`refMode=${refMode}`, () => {
        const plan = planForFiles(intake.files, { ...DEFAULT_SETTINGS, refMode });

        it("turns every parsed token into a variable — no alias goes unresolved", () => {
          const emitted = new Set(plan.variables.map((v) => v.name));
          const missing = [...parsed].filter((k) => !emitted.has(k.split("::")[1]!));
          expect(missing).toEqual([]);
          expect(plan.variables).toHaveLength(corpus.expected.variables);
        });

        it("routes tokens into the expected collections and modes", () => {
          expect(plan.collections.map((c) => ({ name: c.name, modes: c.modes }))).toEqual(
            corpus.collections,
          );
        });

        it("writes every variable through the Figma API with no errors", async () => {
          const api = createInMemoryFigmaApi();
          const report = await write(plan, api);
          expect(report.errors).toEqual([]);
          expect(report.created).toBe(plan.variables.length);
          expect(api.variables).toHaveLength(plan.variables.length);
          // Every variable has a value in every mode of its collection.
          for (const v of api.variables) {
            const modes = api.collections.find((c) => c.id === v.collectionId)!.modes;
            expect(v.values.size, v.name).toBe(modes.length);
          }
        });

        it("reports no error-level warnings beyond the documented skips", () => {
          // Everything else the import surfaces is a `notice`: a unit
          // conversion or a layered-theme mode fill, where the token did
          // import (ADR-0020).
          const errors = [...intake.warnings, ...plan.warnings].filter(
            (w) => w.level !== "notice",
          );
          expect(errors.map((w) => `${w.file}::${w.path}`).sort()).toEqual(
            Object.keys(corpus.skips).sort(),
          );
        });
      });
    }
  });
}
