import type { Token } from "../dtcg/types.js";

export type VariableOp = {
  collection: string;
  mode: string;
  name: string;
  resolvedType: "COLOR" | "FLOAT";
  /** For COLOR: hex string. For FLOAT: number. */
  value: string | number;
  source: { file: string; path: string };
};

export type VariablePlan = {
  collections: { name: string; mode: string }[];
  variables: VariableOp[];
};

/** MVP mapping: every token → "Primitives" collection, single "Value" mode. */
export function planForPrimitives(tokens: Token[]): VariablePlan {
  const COLLECTION = "Primitives";
  const MODE = "Value";
  return {
    collections: [{ name: COLLECTION, mode: MODE }],
    variables: tokens.map((t) => ({
      collection: COLLECTION,
      mode: MODE,
      name: t.name,
      resolvedType: t.type === "color" ? "COLOR" : "FLOAT",
      value: t.value,
      source: { file: t.file, path: t.name },
    })),
  };
}
