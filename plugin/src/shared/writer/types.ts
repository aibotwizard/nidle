import type { CollectionName } from "../mapping/toFigma.js";

export type FigmaVarType = "COLOR" | "FLOAT";

export type FigmaRgba = { r: number; g: number; b: number; a: number };

export type FigmaValue =
  | FigmaRgba
  | number
  | { kind: "alias"; variableHandle: VariableHandle };

export type CollectionHandle = {
  id: string;
  name: CollectionName;
};

export type VariableHandle = {
  id: string;
  name: string;
  collectionId: string;
};

export type ExistingCollection = {
  handle: CollectionHandle;
  /** Figma's `VariableCollection.defaultModeId` — the modeId rendered in the
   *  leftmost "Default" column of the Variables panel. NOT always
   *  `modes[0].modeId`: users can reorder modes, after which `modes[0]` is
   *  array-position and `defaultModeId` is the actual default. Writes to a
   *  non-default mode leave the default mode at its create-time value, which
   *  for COLOR variables renders as white in the panel. */
  defaultModeId: string;
  modes: { modeId: string; name: string }[];
};

export type ExistingVariable = {
  handle: VariableHandle;
};

/**
 * The seam between the writer and the Figma sandbox. Two adapters:
 *
 * - `figmaApiLive` (in code/figmaApiLive.ts) calls `figma.variables.*` directly.
 * - `createInMemoryFigmaApi` (in shared/writer/inMemoryFigmaApi.ts) records ops
 *   so the writer can be exercised under `vitest` without a Figma runtime.
 *
 * Methods stay narrow on purpose — only what the writer actually needs.
 */
export type FigmaApi = {
  listCollections(): ExistingCollection[];
  createCollection(name: CollectionName): ExistingCollection;
  renameMode(collectionId: string, modeId: string, name: string): void;
  addMode(collectionId: string, name: string): string;
  listVariables(): ExistingVariable[];
  createVariable(
    name: string,
    collectionId: string,
    type: FigmaVarType,
  ): VariableHandle;
  setValueForMode(
    variableId: string,
    modeId: string,
    value: FigmaValue,
  ): void;
};

export type WriteError = {
  variable: string;
  reason: string;
  source: { file: string; path: string };
};

export type LogTone = "dim" | "plain" | "accent" | "ok" | "err";

export type WriteProgress = {
  pct: number;
  line: string;
  tone: LogTone;
};

export type WriteReport = {
  created: number;
  updated: number;
  errors: WriteError[];
};

export type WriteOptions = {
  onProgress?: (p: WriteProgress) => void;
};

export type ResolvedCollection = {
  handle: CollectionHandle;
  /** mode name → modeId */
  modeIds: Map<string, string>;
  /** Mode names the plan requested but could not be added (e.g. Figma plan limit). */
  skippedModes: Set<string>;
};
