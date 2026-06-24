import type { CollectionName } from "../mapping/toFigma.js";
import type { FigmaApi, FigmaValue, FigmaVarType } from "./types.js";

export type MemCollection = {
  id: string;
  name: CollectionName;
  modes: { modeId: string; name: string }[];
};

export type MemVariable = {
  id: string;
  name: string;
  collectionId: string;
  type: FigmaVarType;
  /** modeId → value */
  values: Map<string, FigmaValue>;
};

export type SeedCollection = { name: CollectionName; modes: string[] };

export type SeedVariable = {
  collection: CollectionName;
  name: string;
  type: FigmaVarType;
};

export type InMemorySeed = {
  collections?: SeedCollection[];
  variables?: SeedVariable[];
};

export type InMemoryFigmaApi = FigmaApi & {
  collections: MemCollection[];
  variables: MemVariable[];
  /** modeId → mode name, useful for assertions. */
  modeNameOf(modeId: string): string | undefined;
  /** Read a written value by (collectionName, variableName, modeName). */
  read(
    collection: CollectionName,
    variableName: string,
    modeName: string,
  ): FigmaValue | undefined;
};
