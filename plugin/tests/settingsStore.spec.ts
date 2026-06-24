import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/shared/mapping/toFigma.js";
import { createSettingsStore } from "../src/ui/settings/settingsStore.js";
import { createInMemoryStorage } from "../src/ui/settings/inMemoryStorage.js";
import { mergeWithDefaults } from "../src/ui/settings/validate.js";

describe("mergeWithDefaults", () => {
  it("returns the defaults when input is null/garbage", () => {
    expect(mergeWithDefaults(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeWithDefaults(42)).toEqual(DEFAULT_SETTINGS);
    expect(mergeWithDefaults("nope")).toEqual(DEFAULT_SETTINGS);
  });

  it("fills missing fields from defaults", () => {
    expect(mergeWithDefaults({ refMode: "resolve" })).toEqual({
      refMode: "resolve",
      separator: DEFAULT_SETTINGS.separator,
      updateExisting: DEFAULT_SETTINGS.updateExisting,
    });
  });

  it("rejects unknown values for enum fields", () => {
    const merged = mergeWithDefaults({
      refMode: "bogus" as unknown as "keepAlias",
      separator: "weird" as unknown as "slash",
      updateExisting: "yes" as unknown as boolean,
    });
    expect(merged).toEqual(DEFAULT_SETTINGS);
  });
});

describe("SettingsStore — load + subscribe", () => {
  it("starts with defaults and broadcasts after async load", async () => {
    const storage = createInMemoryStorage({ refMode: "resolve" });
    const store = createSettingsStore(storage);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    const events: ReturnType<typeof store.get>[] = [];
    store.subscribe((s) => events.push(s));
    await new Promise((r) => setTimeout(r, 0));
    expect(store.get().refMode).toBe("resolve");
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("SettingsStore — update", () => {
  it("merges the patch, broadcasts, and persists through the adapter", async () => {
    const storage = createInMemoryStorage();
    const store = createSettingsStore(storage);
    await new Promise((r) => setTimeout(r, 0));

    const seen: ReturnType<typeof store.get>[] = [];
    store.subscribe((s) => seen.push(s));

    store.update({ separator: "dot" });
    expect(store.get().separator).toBe("dot");
    expect(seen[seen.length - 1]!.separator).toBe("dot");
    // Save is fire-and-forget through the adapter; let the microtask flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(storage.peek().separator).toBe("dot");
  });

  it("unsubscribe stops further notifications", async () => {
    const store = createSettingsStore(createInMemoryStorage());
    await new Promise((r) => setTimeout(r, 0));
    let count = 0;
    const off = store.subscribe(() => count++);
    store.update({ separator: "dot" });
    off();
    store.update({ separator: "slash" });
    expect(count).toBe(1);
  });
});
