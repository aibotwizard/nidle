import { describe, expect, it } from "vitest";
import type { PlanError } from "../../src/code/messages.js";
import {
  initialState,
  reducer,
  type State,
} from "../../src/ui/state/appState.js";

const err = (i: number): PlanError => ({
  variable: `color/blue/${i}`,
  reason: "boom",
  source: { file: "core/color.json", path: `blue.${i}` },
});

describe("appState reducer — doneReceived", () => {
  it("logs a success summary with tone ok when there are no errors", () => {
    const s = reducer(initialState, {
      type: "doneReceived",
      created: 3,
      updated: 1,
      errors: [],
    });
    expect(s.importing).toBe(false);
    expect(s.done).toBe(true);
    expect(s.progress).toBe(100);
    expect(s.result).toEqual({ created: 3, updated: 1, errors: [] });
    expect(s.log[s.log.length - 1]).toEqual({
      text: "✓ Imported 3 created, 1 updated",
      tone: "ok",
    });
  });

  it("previews at most 12 errors and appends a truncation line", () => {
    const errors = Array.from({ length: 15 }, (_, i) => err(i));
    const s = reducer(initialState, {
      type: "doneReceived",
      created: 0,
      updated: 0,
      errors,
    });
    const texts = s.log.map((l) => l.text);
    expect(texts.filter((t) => t.includes("— boom"))).toHaveLength(12);
    expect(texts).toContain("…and 3 more");
    expect(s.log[s.log.length - 1]).toEqual({
      text: "✓ Imported 0 created, 0 updated (15 errors)",
      tone: "err",
    });
    expect(s.result?.errors).toHaveLength(15);
  });
});

describe("appState reducer — import lifecycle", () => {
  it("importStarted replaces the log with the seed line", () => {
    const before: State = {
      ...initialState,
      log: [{ text: "old", tone: "dim" }],
    };
    const s = reducer(before, { type: "importStarted", count: 7 });
    expect(s.step).toBe(4);
    expect(s.importing).toBe(true);
    expect(s.log).toEqual([
      { text: "Sending 7 variables to Figma…", tone: "dim" },
    ]);
  });

  it("importBlockedEmpty lands on step 4 done with an empty result", () => {
    const s = reducer(initialState, { type: "importBlockedEmpty" });
    expect(s.step).toBe(4);
    expect(s.done).toBe(true);
    expect(s.result).toEqual({ created: 0, updated: 0, errors: [] });
    expect(s.log[s.log.length - 1]).toEqual({
      text: "No tokens to import.",
      tone: "err",
    });
  });

  it("reset returns to the initial state", () => {
    const mid = reducer(initialState, { type: "importStarted", count: 2 });
    expect(reducer(mid, { type: "reset" })).toEqual(initialState);
  });
});
