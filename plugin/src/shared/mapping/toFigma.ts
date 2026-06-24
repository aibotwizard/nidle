import {
  resolveTokens,
  type ResolveMode,
  type ResolvedToken,
} from "../dtcg/resolve.js";
import type { ParseWarning, Token } from "../dtcg/types.js";

export type CollectionName = "Primitives" | "Semantic" | "Components";

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

export type CollectionPlan = {
  name: CollectionName;
  /** First entry is the default mode. */
  modes: string[];
};

export type VariableOp = {
  collection: CollectionName;
  name: string;
  resolvedType: "COLOR" | "FLOAT";
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
  collection: CollectionName;
  fallbackWarning?: ParseWarning;
} {
  const top = (path.split("/")[0] ?? "").toLowerCase();
  if (PRIMITIVES_TOPS.has(top)) return { collection: "Primitives" };
  if (SEMANTIC_TOPS.has(top)) return { collection: "Semantic" };
  if (top === "components") return { collection: "Components" };
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

const ORDERED_COLLECTIONS: CollectionName[] = [
  "Primitives",
  "Semantic",
  "Components",
];

export function planForFiles(
  filesIn: FileTokens[],
  settings: MappingSettings,
): VariablePlan {
  const warnings: ParseWarning[] = [];

  const byCollection = new Map<CollectionName, FileTokens[]>();
  const fileCollection = new Map<string, CollectionName>();
  for (const f of filesIn) {
    const { collection, fallbackWarning } = collectionForFile(f.file);
    if (fallbackWarning) warnings.push(fallbackWarning);
    fileCollection.set(f.file, collection);
    const list = byCollection.get(collection) ?? [];
    list.push(f);
    byCollection.set(collection, list);
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

  for (const cname of ORDERED_COLLECTIONS) {
    const cFiles = byCollection.get(cname);
    if (!cFiles || cFiles.length === 0) continue;

    const themeGroups = detectThemeGroups(cname, cFiles);
    allThemeGroups.push(...themeGroups);
    const modeNames = pickModeNames(themeGroups);

    collectionPlans.push({ name: cname, modes: modeNames });

    const opByName = new Map<string, VariableOp>();
    for (const group of themeGroups) {
      for (const f of group.files) {
        const modeName = group.kind === "themed" ? basenameMode(f.file) : "Value";
        for (const tok of f.tokens) {
          const r = resolvedByFileName.get(`${f.file}::${tok.name}`);
          if (!r) continue;

          const emittedName = emitName(r.name, settings.separator);
          const resolvedType: "COLOR" | "FLOAT" =
            r.type === "color" ? "COLOR" : "FLOAT";

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
          existing.values.push({ mode: modeName, value: valueSpec });
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
    if (list.length > 1 && sameShape(list)) {
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

function shapeKey(tokens: Token[]): string {
  return tokens.map((t) => `${t.name}:${t.type}`).sort().join("|");
}

function sameShape(files: FileTokens[]): boolean {
  if (files.length < 2) return true;
  const first = shapeKey(files[0]!.tokens);
  if (first.length === 0) return false;
  for (let i = 1; i < files.length; i++) {
    if (shapeKey(files[i]!.tokens) !== first) return false;
  }
  return true;
}

function pickModeNames(groups: ThemeGroup[]): string[] {
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

  const defaultIdx = names.findIndex((n) => n.toLowerCase() === "default");
  if (defaultIdx > 0) {
    const [d] = names.splice(defaultIdx, 1);
    names.unshift(d!);
  }
  return names;
}
