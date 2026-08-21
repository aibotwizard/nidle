import {
  resolveTokens,
  type ResolveMode,
  type ResolvedToken,
} from "../dtcg/resolve.js";
import type { ParseWarning, Token } from "../dtcg/types.js";

/**
 * Folder routing lands every file in one of three base collections;
 * semantic theme groups may then split into their own collections
 * (`Semantic-Color-Scheme`, `Semantic-Appearance`, `Semantic-<Dir>`),
 * so the final collection name is an open string.
 */
export type BaseCollection = "Primitives" | "Semantic" | "Components";
export type CollectionName = string;

export type Separator = "slash" | "dot";

export type MappingSettings = {
  refMode: ResolveMode;
  separator: Separator;
  updateExisting: boolean;
};

export const DEFAULT_SETTINGS: MappingSettings = {
  refMode: "keepAlias",
  separator: "slash",
  updateExisting: true,
};

/**
 * Merge a stored payload (possibly partial, possibly stale, possibly
 * corrupt) with the defaults, dropping unknown values. The single point
 * of trust for what a valid `MappingSettings` looks like — used on BOTH
 * sides of the postMessage boundary (req-0002 / FR-906).
 */
export function mergeWithDefaults(raw: unknown): MappingSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const r = raw as Partial<MappingSettings>;
  return {
    refMode: r.refMode === "resolve" ? "resolve" : "keepAlias",
    separator: r.separator === "dot" ? "dot" : "slash",
    updateExisting:
      typeof r.updateExisting === "boolean"
        ? r.updateExisting
        : DEFAULT_SETTINGS.updateExisting,
  };
}

export type CollectionPlan = {
  name: CollectionName;
  /** First entry is the default mode. */
  modes: string[];
};

export type VariableOp = {
  collection: CollectionName;
  name: string;
  resolvedType: "COLOR" | "FLOAT" | "STRING";
  values: ModeValue[];
  source: { file: string; path: string };
  op: "create" | "createOrUpdate";
};

export type ModeValue = {
  mode: string;
  value: ValueSpec;
};

export type ValueSpec =
  | { kind: "literal"; value: string | number }
  | {
      kind: "alias";
      targetCollection: CollectionName;
      targetName: string;
    };

export type ThemeGroup =
  | { kind: "themed"; collection: CollectionName; dir: string; files: FileTokens[] }
  | { kind: "single"; collection: CollectionName; dir: string; files: [FileTokens] };

export type VariablePlan = {
  collections: CollectionPlan[];
  variables: VariableOp[];
  warnings: ParseWarning[];
  themeGroups: ThemeGroup[];
};

export type FileTokens = {
  file: string;
  tokens: Token[];
};

const PRIMITIVES_TOPS = new Set([
  "core",
  "palette",
  "figmaonly",
]);

const SEMANTIC_TOPS = new Set([
  "semantic",
  "schemestatic",
  "scheme",
  "device",
  "appearance",
  "theme",
  "elements",
  "utilities",
  "helpers",
]);

export function collectionForFile(path: string): {
  collection: BaseCollection;
  fallbackWarning?: ParseWarning;
} {
  const top = (path.split("/")[0] ?? "").toLowerCase();
  if (PRIMITIVES_TOPS.has(top)) return { collection: "Primitives" };
  if (SEMANTIC_TOPS.has(top)) return { collection: "Semantic" };
  if (top === "components" || top === "component") return { collection: "Components" };
  if (!path.includes("/")) return { collection: "Primitives" };
  return {
    collection: "Primitives",
    fallbackWarning: {
      file: path,
      path: "(root)",
      reason: `unknown top-level folder "${path.split("/")[0]}" — defaulted to Primitives`,
    },
  };
}

export function emitName(name: string, sep: Separator): string {
  return sep === "dot" ? name.split("/").join(".") : name;
}

export function basenameMode(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/i, "");
  return base.length === 0 ? base : base[0]!.toUpperCase() + base.slice(1);
}

const BASE_ORDER: BaseCollection[] = [
  "Primitives",
  "Semantic",
  "Components",
];

/**
 * Mode-switcher recognition for the semantic split (Jira: OpenUI
 * productionisation, AC 1.1). A themed group whose mode set matches an
 * entry becomes that collection, with the modes in the listed order —
 * the first is the collection's default mode.
 */
const SEMANTIC_SPLITS: { name: CollectionName; modes: string[] }[] = [
  { name: "Semantic-Color-Scheme", modes: ["Light", "Dark"] },
  { name: "Semantic-Appearance", modes: ["Desktop", "Tablet"] },
];

function finalCollectionFor(base: BaseCollection, group: ThemeGroup): CollectionName {
  if (base !== "Semantic" || group.kind !== "themed") return base;
  const modes = group.files.map((f) => basenameMode(f.file).toLowerCase()).sort();
  const split = SEMANTIC_SPLITS.find(
    (s) =>
      s.modes.length === modes.length &&
      [...s.modes].map((m) => m.toLowerCase()).sort().every((m, i) => m === modes[i]),
  );
  if (split) return split.name;
  // AC 1.2: any other mode switcher gets its own collection, named from
  // the directory that grouped it.
  const dirBase = group.dir.split("/").pop() ?? "";
  return dirBase
    ? `Semantic-${dirBase[0]!.toUpperCase()}${dirBase.slice(1)}`
    : "Semantic";
}

export function planForFiles(
  filesIn: FileTokens[],
  settings: MappingSettings,
): VariablePlan {
  const warnings: ParseWarning[] = [];

  const byBase = new Map<BaseCollection, FileTokens[]>();
  for (const f of filesIn) {
    const { collection, fallbackWarning } = collectionForFile(f.file);
    if (fallbackWarning) warnings.push(fallbackWarning);
    const list = byBase.get(collection) ?? [];
    list.push(f);
    byBase.set(collection, list);
  }

  // Theme groups are detected per base collection, then each group is
  // assigned its final collection (semantic groups may split). Alias
  // targets must use the final assignment, so fileCollection is built
  // from the groups, not from the routing table.
  const fileCollection = new Map<string, CollectionName>();
  const byFinal = new Map<CollectionName, ThemeGroup[]>();
  const finalOrder: CollectionName[] = [];
  for (const base of BASE_ORDER) {
    const cFiles = byBase.get(base);
    if (!cFiles || cFiles.length === 0) continue;
    for (const detected of detectThemeGroups(base, cFiles)) {
      const cname = finalCollectionFor(base, detected);
      const group: ThemeGroup = { ...detected, collection: cname };
      const list = byFinal.get(cname);
      if (list) {
        list.push(group);
      } else {
        byFinal.set(cname, [group]);
        finalOrder.push(cname);
      }
      for (const f of group.files) fileCollection.set(f.file, cname);
    }
  }

  const allTokens = filesIn.flatMap((f) => f.tokens);
  const { tokens: resolved, warnings: resolveWarnings } = resolveTokens(
    allTokens,
    settings.refMode,
  );
  warnings.push(...resolveWarnings);

  const resolvedByFileName = new Map<string, ResolvedToken>();
  for (const t of resolved) {
    resolvedByFileName.set(`${t.file}::${t.name}`, t);
  }

  // First-match wins when the same DTCG path is defined in multiple files —
  // the alternative (last-write or warn-on-conflict) churns on legitimate
  // theme overrides where the same name appears in light.json + dark.json.
  const tokenFileByName = new Map<string, string>();
  for (const t of allTokens) {
    if (!tokenFileByName.has(t.name)) tokenFileByName.set(t.name, t.file);
  }

  const collectionPlans: CollectionPlan[] = [];
  const variables: VariableOp[] = [];
  const allThemeGroups: ThemeGroup[] = [];

  for (const cname of finalOrder) {
    const themeGroups = byFinal.get(cname)!;
    allThemeGroups.push(...themeGroups);
    const modeNames = pickModeNames(cname, themeGroups);

    collectionPlans.push({ name: cname, modes: modeNames });

    const opByName = new Map<string, VariableOp>();
    for (const group of themeGroups) {
      const touched = new Set<string>();
      for (const f of group.files) {
        const modeName = group.kind === "themed" ? basenameMode(f.file) : "Value";
        for (const tok of f.tokens) {
          const r = resolvedByFileName.get(`${f.file}::${tok.name}`);
          if (!r) continue;

          const emittedName = emitName(r.name, settings.separator);
          const resolvedType: VariableOp["resolvedType"] =
            r.type === "color" ? "COLOR" : r.type === "text" ? "STRING" : "FLOAT";

          let valueSpec: ValueSpec;
          if (r.value.kind === "literal") {
            valueSpec = { kind: "literal", value: r.value.value };
          } else {
            const targetFile = tokenFileByName.get(r.value.targetName);
            const targetCollection: CollectionName = targetFile
              ? fileCollection.get(targetFile) ?? "Primitives"
              : "Primitives";
            valueSpec = {
              kind: "alias",
              targetCollection,
              targetName: emitName(r.value.targetName, settings.separator),
            };
          }

          let existing = opByName.get(emittedName);
          if (!existing) {
            existing = {
              collection: cname,
              name: emittedName,
              resolvedType,
              values: [],
              source: { file: f.file, path: tok.name },
              op: settings.updateExisting ? "createOrUpdate" : "create",
            };
            opByName.set(emittedName, existing);
          } else if (existing.resolvedType !== resolvedType) {
            warnings.push({
              file: f.file,
              path: tok.name,
              reason: `token "${emittedName}" has conflicting types across modes (${existing.resolvedType} vs ${resolvedType})`,
            });
            continue;
          }
          if (existing.values.some((v) => v.mode === modeName)) {
            warnings.push({
              file: f.file,
              path: tok.name,
              reason: `token "${emittedName}" already defined for mode "${modeName}" — first definition wins`,
            });
            continue;
          }
          existing.values.push({ mode: modeName, value: valueSpec });
          touched.add(emittedName);
        }
      }

      // Theme sets may drift (a token present in Light but not Dark).
      // Fill the missing modes from the collection's default mode so no
      // mode is left at Figma's initial value — surfaced per token.
      if (group.kind === "themed") {
        const groupModes = group.files
          .map((f) => basenameMode(f.file))
          .sort((a, b) => modeNames.indexOf(a) - modeNames.indexOf(b));
        for (const name of touched) {
          const op = opByName.get(name)!;
          const have = new Set(op.values.map((v) => v.mode));
          const srcMode = groupModes.find((m) => have.has(m));
          const src = op.values.find((v) => v.mode === srcMode);
          if (!src) continue;
          for (const m of groupModes) {
            if (have.has(m)) continue;
            op.values.push({ mode: m, value: src.value });
            warnings.push({
              file: op.source.file,
              path: op.source.path,
              reason: `token "${op.name}" missing in mode "${m}" — value filled from mode "${srcMode}"`,
            });
          }
        }
      }
    }
    variables.push(...opByName.values());
  }

  return {
    collections: collectionPlans,
    variables,
    warnings,
    themeGroups: allThemeGroups,
  };
}

export function detectThemeGroups(
  collection: CollectionName,
  files: FileTokens[],
): ThemeGroup[] {
  const byDir = new Map<string, FileTokens[]>();
  for (const f of files) {
    const dir = dirOf(f.file);
    const list = byDir.get(dir) ?? [];
    list.push(f);
    byDir.set(dir, list);
  }
  const out: ThemeGroup[] = [];
  for (const [dir, list] of byDir.entries()) {
    if (isThemedSiblings(list)) {
      out.push({ kind: "themed", collection, dir, files: list });
    } else {
      for (const f of list) {
        out.push({ kind: "single", collection, dir, files: [f] });
      }
    }
  }
  return out;
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/**
 * Sibling files are theme variants when the `(name, type)` shape they
 * share covers at least half of the smallest file. Real theme sets
 * drift a little (a token present only in Light) but still share most
 * of their shape; unrelated sibling sets share none, because each is
 * namespaced under its own group. Observed margins: ≥0.83 for theme
 * sets vs 0.0 for unrelated ones (ADR-0015).
 */
function isThemedSiblings(files: FileTokens[]): boolean {
  if (files.length < 2) return false;
  const shapes = files.map(
    (f) => new Set(f.tokens.map((t) => `${t.name}:${t.type}`)),
  );
  if (shapes.some((s) => s.size === 0)) return false;
  const [first, ...rest] = shapes;
  let shared = 0;
  for (const key of first!) {
    if (rest.every((s) => s.has(key))) shared++;
  }
  const smallest = Math.min(...shapes.map((s) => s.size));
  return shared / smallest >= 0.5;
}

function pickModeNames(cname: CollectionName, groups: ThemeGroup[]): string[] {
  const names: string[] = [];
  let hasSingle = false;
  for (const g of groups) {
    if (g.kind === "themed") {
      for (const f of g.files) {
        const m = basenameMode(f.file);
        if (!names.includes(m)) names.push(m);
      }
    } else {
      hasSingle = true;
    }
  }
  if (hasSingle && !names.includes("Value")) names.push("Value");
  if (names.length === 0) names.push("Value");

  // Recognised splits carry a canonical mode order; the first mode is
  // the collection default (Light for Color-Scheme, Desktop for
  // Appearance), regardless of file upload order.
  const split = SEMANTIC_SPLITS.find((s) => s.name === cname);
  if (split) {
    names.sort(
      (a, b) =>
        split.modes.findIndex((m) => m.toLowerCase() === a.toLowerCase()) -
        split.modes.findIndex((m) => m.toLowerCase() === b.toLowerCase()),
    );
  }

  const defaultIdx = names.findIndex((n) => n.toLowerCase() === "default");
  if (defaultIdx > 0) {
    const [d] = names.splice(defaultIdx, 1);
    names.unshift(d!);
  }
  return names;
}
