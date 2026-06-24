import type {
  ExistingCollection,
  ExistingVariable,
  VariableHandle,
} from "./types.js";
import type {
  InMemoryFigmaApi,
  InMemorySeed,
  MemCollection,
  MemVariable,
} from "./inMemoryTypes.js";

/**
 * Drop-in in-memory FigmaApi used by tests and prototypes. Persists the
 * full state across calls so re-runs exercise the upsert path of the
 * writer just like a real Figma file would.
 *
 * Seed with existing collections/variables to simulate a non-empty file.
 */
export function createInMemoryFigmaApi(seed?: InMemorySeed): InMemoryFigmaApi {
  const collections: MemCollection[] = [];
  const variables: MemVariable[] = [];
  let nextId = 1;
  const newId = (p: string) => `${p}${nextId++}`;

  seedState(collections, variables, seed, newId);

  return {
    collections,
    variables,
    modeNameOf: (modeId) => findModeName(collections, modeId),
    read: (collection, name, modeName) =>
      readValue(collections, variables, collection, name, modeName),
    listCollections: () => collections.map(toExistingCollection),
    createCollection: (name) => {
      const c: MemCollection = {
        id: newId("c"),
        name,
        modes: [{ modeId: newId("m"), name: "Value" }],
      };
      collections.push(c);
      return toExistingCollection(c);
    },
    renameMode: (collectionId, modeId, name) => {
      const c = mustCollection(collections, collectionId, "renameMode");
      const m = c.modes.find((x) => x.modeId === modeId);
      if (!m) throw new Error(`renameMode: unknown mode ${modeId}`);
      m.name = name;
    },
    addMode: (collectionId, name) => {
      const c = mustCollection(collections, collectionId, "addMode");
      const id = newId("m");
      c.modes.push({ modeId: id, name });
      return id;
    },
    listVariables: () => variables.map(toExistingVariable),
    createVariable: (name, collectionId, type): VariableHandle => {
      mustCollection(collections, collectionId, "createVariable");
      const v: MemVariable = {
        id: newId("v"),
        name,
        collectionId,
        type,
        values: new Map(),
      };
      variables.push(v);
      return { id: v.id, name: v.name, collectionId: v.collectionId };
    },
    setValueForMode: (variableId, modeId, value) => {
      const v = variables.find((x) => x.id === variableId);
      if (!v) throw new Error(`setValueForMode: unknown variable ${variableId}`);
      v.values.set(modeId, value);
    },
  };
}

function seedState(
  collections: MemCollection[],
  variables: MemVariable[],
  seed: InMemorySeed | undefined,
  newId: (p: string) => string,
): void {
  for (const c of seed?.collections ?? []) {
    const modes = c.modes.length > 0 ? c.modes : ["Value"];
    collections.push({
      id: newId("c"),
      name: c.name,
      modes: modes.map((m) => ({ modeId: newId("m"), name: m })),
    });
  }
  for (const v of seed?.variables ?? []) {
    const c = collections.find((x) => x.name === v.collection);
    if (!c) throw new Error(`seed variable in unknown collection ${v.collection}`);
    variables.push({
      id: newId("v"),
      name: v.name,
      collectionId: c.id,
      type: v.type,
      values: new Map(),
    });
  }
}

function toExistingCollection(c: MemCollection): ExistingCollection {
  return {
    handle: { id: c.id, name: c.name },
    defaultModeId: c.modes[0]!.modeId,
    modes: c.modes.slice(),
  };
}

function toExistingVariable(v: MemVariable): ExistingVariable {
  return {
    handle: { id: v.id, name: v.name, collectionId: v.collectionId },
  };
}

function findModeName(
  collections: MemCollection[],
  modeId: string,
): string | undefined {
  for (const c of collections) {
    const m = c.modes.find((x) => x.modeId === modeId);
    if (m) return m.name;
  }
  return undefined;
}

function readValue(
  collections: MemCollection[],
  variables: MemVariable[],
  collectionName: string,
  variableName: string,
  modeName: string,
) {
  const c = collections.find((x) => x.name === collectionName);
  if (!c) return undefined;
  const v = variables.find(
    (x) => x.collectionId === c.id && x.name === variableName,
  );
  if (!v) return undefined;
  const m = c.modes.find((x) => x.name === modeName);
  if (!m) return undefined;
  return v.values.get(m.modeId);
}

function mustCollection(
  collections: MemCollection[],
  id: string,
  op: string,
): MemCollection {
  const c = collections.find((x) => x.id === id);
  if (!c) throw new Error(`${op}: unknown collection ${id}`);
  return c;
}
