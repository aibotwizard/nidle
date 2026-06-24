import type { CollectionName, VariablePlan } from "../mapping/toFigma.js";
import type {
  FigmaApi,
  ResolvedCollection,
  WriteProgress,
} from "./types.js";

/**
 * Ensure each collection in the plan exists, has the right modes, and the
 * initial mode is renamed to the plan's first mode. Returns a lookup keyed
 * by collection name so downstream steps can resolve modeIds.
 */
export function setupCollections(
  plan: VariablePlan,
  api: FigmaApi,
  onProgress: (p: WriteProgress) => void,
): Map<CollectionName, ResolvedCollection> {
  const all = api.listCollections();
  const out = new Map<CollectionName, ResolvedCollection>();

  for (const c of plan.collections) {
    const existing = all.find((vc) => vc.handle.name === c.name);
    const collection = existing ?? api.createCollection(c.name);

    const modeIds = new Map<string, string>();
    const wantedFirst = c.modes[0] ?? "Value";
    // The plan's first mode must map to the collection's defaultModeId —
    // that's the modeId Figma renders in the leftmost "Default" column of
    // the Variables panel. Writing to a non-default mode leaves the
    // default at its create-time value, which for COLOR variables renders
    // as white. `modes[0]` is array-position and can diverge from
    // `defaultModeId` once a user reorders modes.
    const initialMode = collection.modes.find(
      (m) => m.modeId === collection.defaultModeId,
    ) ?? collection.modes[0]!;
    if (initialMode.name !== wantedFirst) {
      api.renameMode(collection.handle.id, initialMode.modeId, wantedFirst);
    }
    modeIds.set(wantedFirst, initialMode.modeId);

    const skippedModes = new Set<string>();
    let modesLimited = false;
    for (let i = 1; i < c.modes.length; i++) {
      const name = c.modes[i]!;
      const found = collection.modes.find((m) => m.name === name);
      if (found) {
        modeIds.set(name, found.modeId);
      } else {
        try {
          modeIds.set(name, api.addMode(collection.handle.id, name));
        } catch {
          modesLimited = true;
          for (let j = i; j < c.modes.length; j++) skippedModes.add(c.modes[j]!);
          break;
        }
      }
    }

    out.set(c.name, { handle: collection.handle, modeIds, skippedModes });
    const addedModes = modeIds.size;
    const writeTarget = `default → "${wantedFirst}" (${initialMode.modeId})`;
    onProgress({
      pct: 5,
      line: modesLimited
        ? `Collection "${c.name}" ready (${addedModes} of ${c.modes.length} modes, ${writeTarget} — upgrade Figma plan for multi-mode support)`
        : `Collection "${c.name}" ready (${addedModes} mode${addedModes === 1 ? "" : "s"}: ${[...modeIds.keys()].join(", ")}; ${writeTarget})`,
      tone: modesLimited ? "err" : "plain",
    });
  }
  return out;
}
