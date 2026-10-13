// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../../src/ui/App.js";
import { createInMemoryStorage } from "../../src/ui/io/settingsIO.js";
import type { SandboxTransport } from "../../src/ui/io/types.js";
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

/** One browser File as the picker reports it from a chosen `tokens/` folder. */
function pickedFile(path: string, body: string): File {
  const f = new File([body], path.split("/").pop()!, { type: "application/json" });
  // The picker prefixes paths with the chosen folder's own name;
  // intake.fromPicker strips that first segment, recovering `path`.
  Object.defineProperty(f, "webkitRelativePath", {
    value: `tokens/${path}`,
    configurable: true,
  });
  return f;
}

function pickedFiles(uploads: { path: string; json: unknown }[]): File[] {
  return uploads.map((u) => pickedFile(u.path, JSON.stringify(u.json)));
}

const fixtureFiles = (name: string) => pickedFiles(loadFixtureUploads(name).uploads);

function renderApp() {
  const fake = createFakeTransport();
  const storage = createInMemoryStorage();
  render(<App transport={fake.transport} storage={storage} />);
  return { fake, storage };
}

async function walkToImport(fake: ReturnType<typeof createFakeTransport>) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: fixtureFiles("m1-primitives") } });
  await screen.findByText("2 files detected");
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  fireEvent.click(screen.getByRole("button", { name: "Import 6 variables" }));
  return fake;
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

    // Back returns to the source step and Continue comes forward again.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("2 files detected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Deselecting a file updates the count; reselect to proceed with both.
    fireEvent.click(screen.getByText("dimension.json"));
    expect(screen.getByText("1 sets selected")).toBeTruthy();
    fireEvent.click(screen.getByText("dimension.json"));

    // Step 3: stats match the fixture's expected.json.
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    expect(screen.getByText("Variables")).toBeTruthy();
    expect(screen.getByText("Primitives")).toBeTruthy();
    expect(screen.getByText("color/blue/500")).toBeTruthy();

    // Back from the preview lands on the sets step.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("2 sets selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

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

  it("opens the system picker from the Upload folder button", () => {
    renderApp();
    // fireEvent.click dispatches a MouseEvent without calling .click(), so
    // the spy only sees the programmatic forward to the hidden input.
    const clicks = vi.spyOn(HTMLInputElement.prototype, "click");
    fireEvent.click(screen.getByRole("button", { name: "Upload folder" }));
    expect(clicks).toHaveBeenCalledOnce();
    clicks.mockRestore();
  });

  it("surfaces parse failures on step 3 and step 4 and colors the warnings stat red", async () => {
    const { fake } = renderApp();
    const broken = pickedFile("core/broken.json", "{ nope");
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [...fixtureFiles("m1-primitives"), broken] },
    });
    await screen.findByText("2 files detected");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    // Step 3 lists the unreadable file as a drop (ADR-0022)…
    expect(screen.getByText("1 parse warning")).toBeTruthy();
    expect(screen.getByText(/core\/broken\.json · \(root\) — invalid JSON/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import 6 variables" }));

    // …it is visible in the step 4 console…
    expect(screen.getByText(/core\/broken\.json · \(root\) — invalid JSON/)).toBeTruthy();

    act(() => fake.emit({ type: "done", created: 6, updated: 0, errors: [] }));
    expect(screen.getByText("Import complete")).toBeTruthy();
    // …survives `done`, and the warnings stat counts it in red.
    expect(screen.getByText(/core\/broken\.json · \(root\) — invalid JSON/)).toBeTruthy();
    const warnBig = document.querySelectorAll<HTMLElement>(".done-stats .cell .big")[3]!;
    expect(warnBig.textContent).toBe("1");
    expect(warnBig.style.color).toBe("rgb(255, 139, 139)");
  });

  it("separates step-3 notices from parse warnings (ADR-0020)", async () => {
    renderApp();
    // light/dark are a themed pair: `only` exists in Light alone, so Dark
    // is filled — a notice. `bad` declares a composite type and is dropped
    // — a warning.
    const files = [
      {
        path: "semantic/light.json",
        json: {
          bg: { $type: "color", $value: "#FFFFFF" },
          fg: { $type: "color", $value: "#000000" },
          only: { $type: "color", $value: "#EEEEEE" },
          only2: { $type: "color", $value: "#DDDDDD" },
          only3: { $type: "color", $value: "#CCCCCC" },
        },
      },
      {
        path: "semantic/dark.json",
        json: {
          bg: { $type: "color", $value: "#000000" },
          fg: { $type: "color", $value: "#FFFFFF" },
        },
      },
      { path: "core/x.json", json: { bad: { $type: "shadow", $value: "0 0 1px" } } },
    ];

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: pickedFiles(files) } });
    await screen.findByText("3 files detected");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    // The dropped token is the only thing counted as a parse warning…
    expect(screen.getByText("1 parse warning")).toBeTruthy();
    // …the three mode fills read as notices, in the muted panel.
    expect(screen.getByText("3 notices")).toBeTruthy();
    const notes = document.querySelector<HTMLElement>(".warnings.notes")!;
    expect(notes.textContent).not.toContain("unsupported $type");

    // One line per kind, not per token: three fills collapse into one.
    const lines = Array.from(notes.querySelectorAll(".warning-ln"), (n) => n.textContent);
    expect(lines).toEqual([
      '3× tokens missing in mode "Dark" — filled from mode "Light"',
      "Per-token detail in the import console.",
    ]);

    // The promised per-token detail: plan-stage fills reach the Step 4
    // console (ADR-0020 §4, ADR-0022).
    fireEvent.click(screen.getByRole("button", { name: "Import 5 variables" }));
    expect(screen.getByText(/token "only" missing in mode "Dark"/)).toBeTruthy();
  });

  it("shows the Tokens Studio expansion notice on step 3", async () => {
    renderApp();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: {
        files: pickedFiles([
          {
            path: "tokens.json",
            json: {
              $metadata: { tokenSetOrder: ["core"] },
              core: { c: { $type: "color", $value: "#FFFFFF" } },
            },
          },
        ]),
      },
    });
    await screen.findByText(/detected/);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    const notes = document.querySelector<HTMLElement>(".warnings.notes")!;
    expect(notes.textContent).toContain("1× Tokens Studio combined exports expanded into token sets");
  });

  it("surfaces a sandbox error on step 4", async () => {
    const { fake } = renderApp();
    await walkToImport(fake);

    act(() => fake.emit({ type: "error", message: "kaboom" }));
    expect(screen.getByText("Error: kaboom")).toBeTruthy();
    // The run is over: the done footer offers a way back.
    expect(screen.getByRole("button", { name: "Import another" })).toBeTruthy();
  });

  it("ignores progress messages after done", async () => {
    const { fake } = renderApp();
    await walkToImport(fake);

    act(() => fake.emit({ type: "done", created: 6, updated: 0, errors: [] }));
    act(() => fake.emit({ type: "progress", pct: 10, line: "straggler", tone: "dim" }));
    expect(screen.getByText("Import complete")).toBeTruthy();
    expect(screen.queryByText("straggler")).toBeNull();
  });
});

describe("App — settings sheet", () => {
  it("opens from the title bar, re-renders, and persists through storage", async () => {
    const { storage } = renderApp();
    fireEvent.click(screen.getByTitle("Settings"));
    expect(screen.getByText("Reference handling")).toBeTruthy();

    // Assert on the DOM, not the store: the click must round-trip through
    // the reducer and re-render the sheet with the new active state.
    fireEvent.click(screen.getByRole("button", { name: /Dot/ }));
    expect(screen.getByRole("button", { name: /Dot/ }).className).toContain("active");
    fireEvent.click(screen.getByRole("button", { name: "Resolve to raw value" }));
    expect(
      screen.getByRole("button", { name: "Resolve to raw value" }).className,
    ).toContain("active");

    // Persistence goes through the storage port.
    await new Promise((r) => setTimeout(r, 0));
    expect(storage.peek().separator).toBe("dot");
    expect(storage.peek().refMode).toBe("resolve");

    fireEvent.click(screen.getByTitle("Close settings"));
    expect(screen.queryByText("Reference handling")).toBeNull();
  });

  it("persists the update-existing toggle", async () => {
    const { storage } = renderApp();
    fireEvent.click(screen.getByTitle("Settings"));
    const toggle = document.querySelector<HTMLButtonElement>("button.toggle")!;
    expect(toggle.className).toContain("on");
    fireEvent.click(toggle);
    expect(toggle.className).not.toContain("on");
    await new Promise((r) => setTimeout(r, 0));
    expect(storage.peek().updateExisting).toBe(false);
  });

  it("recomputes the preview when the separator changes", async () => {
    const { fake } = renderApp();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: fixtureFiles("m1-primitives") } });
    await screen.findByText("2 files detected");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    expect(screen.getByText("color/blue/500")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Settings"));
    fireEvent.click(screen.getByRole("button", { name: /Dot/ }));
    fireEvent.click(screen.getByTitle("Close settings"));
    expect(screen.getByText("color.blue.500")).toBeTruthy();
    expect(screen.queryByText("color/blue/500")).toBeNull();
    void fake;
  });

  it("hydrates stored settings on boot", async () => {
    const fake = createFakeTransport();
    const storage = createInMemoryStorage({ separator: "dot" });
    render(<App transport={fake.transport} storage={storage} />);
    fireEvent.click(screen.getByTitle("Settings"));
    // Wait for the async load → dispatch → re-render.
    await screen.findByText("Reference handling");
    await act(async () => {});
    expect(screen.getByRole("button", { name: /Dot/ }).className).toContain("active");
  });
});
