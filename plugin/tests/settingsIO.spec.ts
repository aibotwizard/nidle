import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/shared/mapping/toFigma.js";
import {
  createInMemoryStorage,
  createPostMessageStorage,
  mergeWithDefaults,
} from "../src/ui/io/settingsIO.js";
import type { SandboxTransport } from "../src/ui/io/transport.js";
import type { ToCode, ToUI } from "../src/code/messages.js";

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

describe("createInMemoryStorage", () => {
  it("round-trips saves through load and peek", async () => {
    const storage = createInMemoryStorage({ refMode: "resolve" });
    expect(await storage.load()).toEqual({ refMode: "resolve" });
    await storage.save({ separator: "dot" });
    expect(await storage.load()).toEqual({ separator: "dot" });
    expect(storage.peek()).toEqual({ separator: "dot" });
  });
});

function fakeTransport() {
  const posted: ToCode[] = [];
  const handlers = new Set<(msg: ToUI) => void>();
  const transport: SandboxTransport = {
    postCode: (msg) => posted.push(msg),
    addMessageListener: (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  };
  return { transport, posted, emit: (msg: ToUI) => handlers.forEach((h) => h(msg)) };
}

describe("createPostMessageStorage", () => {
  afterEach(() => vi.useRealTimers());

  it("load posts readSettings and resolves on the settings reply", async () => {
    const { transport, posted, emit } = fakeTransport();
    const storage = createPostMessageStorage(transport);
    const loading = storage.load();
    expect(posted).toEqual([{ type: "readSettings" }]);
    emit({ type: "settings", settings: { separator: "dot" } });
    expect(await loading).toEqual({ separator: "dot" });
  });

  it("save posts writeSettings", async () => {
    const { transport, posted } = fakeTransport();
    await createPostMessageStorage(transport).save({ refMode: "resolve" });
    expect(posted).toEqual([{ type: "writeSettings", settings: { refMode: "resolve" } }]);
  });

  it("load falls back to {} when the sandbox never answers", async () => {
    vi.useFakeTimers();
    const { transport } = fakeTransport();
    const loading = createPostMessageStorage(transport).load();
    vi.advanceTimersByTime(2000);
    expect(await loading).toEqual({});
  });
});
