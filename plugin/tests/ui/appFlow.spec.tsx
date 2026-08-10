// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../../src/ui/App.js";
import { createSettingsStore } from "../../src/ui/settings/settingsStore.js";
import { createInMemoryStorage } from "../../src/ui/settings/inMemoryStorage.js";
import type { SandboxTransport } from "../../src/ui/transport/types.js";
import type { ToCode, ToUI } from "../../src/code/messages.js";
import { loadFixtureUploads } from "../fixtures/loader.js";

afterEach(cleanup);

function createFakeTransport() {
  const posted: ToCode[] = [];
  const handlers = new Set<(msg: ToUI) => void>();
  const transport: SandboxTransport = {
    postCode: (msg) => posted.push(msg),
    addMessageListener: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
  return {
    transport,
    posted,
    emit: (msg: ToUI) => {
      for (const h of handlers) h(msg);
    },
  };
}

/** Fixture uploads → browser File objects, as if a folder was picked. */
function fixtureFiles(name: string): File[] {
  const { uploads } = loadFixtureUploads(name);
  return uploads.map((u) => {
    const base = u.path.split("/").pop()!;
    const f = new File([JSON.stringify(u.json)], base, { type: "application/json" });
    // The picker reports paths relative to the chosen folder's parent;
    // fileReader strips the first segment, recovering u.path.
    Object.defineProperty(f, "webkitRelativePath", {
      value: `tokens/${u.path}`,
      configurable: true,
    });
    return f;
  });
}

function renderApp() {
  const fake = createFakeTransport();
  const store = createSettingsStore(createInMemoryStorage());
  render(<App transport={fake.transport} settingsStore={store} />);
  return { fake, store };
}

describe("App — upload → preview → import flow", () => {
  it("walks all four steps against the m1 fixture", async () => {
    const { fake } = renderApp();

    // Step 1: pick the fixture folder.
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: fixtureFiles("m1-primitives") } });
    await screen.findByText("2 files detected");
    expect(screen.getByText("— 6 tokens")).toBeTruthy();

    // Step 2: both files listed, selected by default.
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("color.json")).toBeTruthy();
    expect(screen.getByText("dimension.json")).toBeTruthy();
    expect(screen.getByText("2 sets selected")).toBeTruthy();

    // Deselecting a file updates the count; reselect to proceed with both.
    fireEvent.click(screen.getByText("dimension.json"));
    expect(screen.getByText("1 sets selected")).toBeTruthy();
    fireEvent.click(screen.getByText("dimension.json"));

    // Step 3: stats match the fixture's expected.json.
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    expect(screen.getByText("Variables")).toBeTruthy();
    expect(screen.getByText("Primitives")).toBeTruthy();
    expect(screen.getByText("color/blue/500")).toBeTruthy();

    // Step 4: the plan crosses the transport, progress + done stream back.
    fireEvent.click(screen.getByRole("button", { name: "Import 6 variables" }));
    expect(fake.posted).toHaveLength(1);
    const msg = fake.posted[0]!;
    if (msg.type !== "applyPlan") throw new Error("expected applyPlan");
    expect(msg.plan.variables).toHaveLength(6);
    expect(msg.plan.collections).toHaveLength(1);
    expect(screen.getByText("Sending 6 variables to Figma…")).toBeTruthy();

    act(() => fake.emit({ type: "progress", pct: 50, line: "halfway there", tone: "dim" }));
    expect(screen.getByText("50% complete")).toBeTruthy();
    expect(screen.getByText("halfway there")).toBeTruthy();

    act(() => fake.emit({ type: "done", created: 6, updated: 0, errors: [] }));
    expect(screen.getByText("Import complete")).toBeTruthy();
    expect(screen.getByText("✓ Imported 6 created, 0 updated")).toBeTruthy();

    // "Import another" resets to step 1.
    fireEvent.click(screen.getByRole("button", { name: "Import another" }));
    expect(screen.getByText("Connect a token source")).toBeTruthy();
  });
});

describe("App — settings sheet", () => {
  it("opens from the title bar and writes through the store", async () => {
    const { store } = renderApp();
    fireEvent.click(screen.getByTitle("Settings"));
    expect(screen.getByText("Reference handling")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Dot/ }));
    expect(store.get().separator).toBe("dot");
    fireEvent.click(screen.getByRole("button", { name: "Resolve to raw value" }));
    expect(store.get().refMode).toBe("resolve");

    fireEvent.click(screen.getByTitle("Close settings"));
    expect(screen.queryByText("Reference handling")).toBeNull();
  });
});
