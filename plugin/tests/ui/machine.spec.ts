import { describe, expect, it } from "vitest";
import type { PlanError } from "../../src/code/messages.js";
import { initialState, reducer, stepOf } from "../../src/ui/state/machine.js";

const err = (i: number): PlanError => ({
  variable: `color/blue/${i}`,
  reason: "boom",
  source: { file: "core/color.json", path: `blue.${i}` },
});

const importing = () => reducer(initialState, { type: "importStarted", count: 7 });

describe("machine — done", () => {
  it("logs a success summary with tone ok when there are no errors", () => {
    const s = reducer(importing(), { type: "done", created: 3, updated: 1, errors: [] });
    expect(s.phase).toEqual({
      kind: "done",
      result: { created: 3, updated: 1, errors: [] },
    });
    expect(stepOf(s.phase)).toBe(4);
    expect(s.log[s.log.length - 1]).toEqual({
      text: "✓ Imported 3 created, 1 updated",
      tone: "ok",
    });
  });

  it("previews at most 12 errors and appends a truncation line", () => {
    const errors = Array.from({ length: 15 }, (_, i) => err(i));
    const s = reducer(importing(), { type: "done", created: 0, updated: 0, errors });
    const texts = s.log.map((l) => l.text);
    expect(texts.filter((t) => t.includes("— boom"))).toHaveLength(12);
    expect(texts).toContain("…and 3 more");
    expect(s.log[s.log.length - 1]).toEqual({
      text: "✓ Imported 0 created, 0 updated (15 errors)",
      tone: "err",
    });
    expect(s.phase.kind === "done" && s.phase.result?.errors).toHaveLength(15);
  });
});

describe("machine — import lifecycle", () => {
  it("importStarted replaces the log with the seed line", () => {
    const s = reducer(
      { ...initialState, log: [{ text: "old", tone: "dim" }] },
      { type: "importStarted", count: 7 },
    );
    expect(s.phase).toEqual({ kind: "importing", progress: 0 });
    expect(stepOf(s.phase)).toBe(4);
    expect(s.log).toEqual([{ text: "Sending 7 variables to Figma…", tone: "dim" }]);
  });

  it("progress updates only while importing", () => {
    const s = reducer(importing(), { type: "progress", pct: 40, line: "…", tone: "dim" });
    expect(s.phase).toEqual({ kind: "importing", progress: 40 });

    const afterDone = reducer(s, { type: "done", created: 1, updated: 0, errors: [] });
    const straggler = reducer(afterDone, {
      type: "progress",
      pct: 10,
      line: "straggler",
      tone: "dim",
    });
    expect(straggler).toBe(afterDone);
  });

  it("a sandbox error ends the run without a result", () => {
    const s = reducer(importing(), { type: "error", message: "kaboom" });
    expect(s.phase).toEqual({ kind: "done" });
    expect(s.log[s.log.length - 1]).toEqual({ text: "Error: kaboom", tone: "err" });
  });

  it("reset returns to the initial state but keeps settings", () => {
    const withSettings = reducer(importing(), {
      type: "settingsChanged",
      patch: { separator: "dot" },
    });
    const s = reducer(withSettings, { type: "reset" });
    expect(s).toEqual({ ...initialState, settings: { ...initialState.settings, separator: "dot" } });
  });
});

describe("machine — settings validation", () => {
  it("merges valid patches and rejects garbage", () => {
    const s = reducer(initialState, {
      type: "settings",
      settings: { refMode: "resolve", separator: "weird" as never },
    });
    expect(s.settings).toEqual({ ...initialState.settings, refMode: "resolve" });
  });
});
