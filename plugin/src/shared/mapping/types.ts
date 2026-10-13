import type { ParseWarning } from "../dtcg/types.js";
import type { FileTokens } from "../intake/types.js";

/**
 * Folder routing lands every file in one of three base collections;
 * semantic theme groups may then split into their own collections
 * (`Semantic-Color-Scheme`, `Semantic-Appearance`, `Semantic-<Dir>`),
 * so the final collection name is an open string.
 */
export type BaseCollection = "Primitives" | "Semantic" | "Components";
export type CollectionName = string;

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

/** The theme groups the settings sheet lists — those that actually split into modes. */
export type ThemedGroup = Extract<ThemeGroup, { kind: "themed" }>;
