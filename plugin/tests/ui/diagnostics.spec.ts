import { describe, expect, it } from "vitest";
import type { ParseWarning } from "../../src/shared/dtcg/types.js";
import { diagnose } from "../../src/ui/state/diagnostics.js";

const drop = (file: string, path = "x"): ParseWarning => ({ file, path, reason: "dropped" });
const notice = (file: string, summary: string, path = "x"): ParseWarning => ({
  file,
  path,
  reason: `${summary} (${path})`,
  level: "notice",
  summary,
});

const files = [
  { path: "core/a.json", selected: true },
  { path: "core/b.json", selected: false },
];

describe("diagnose — which warnings count", () => {
  it("hides a deselected file's warnings but keeps upload-level ones", () => {
    const d = diagnose(
      [
        drop("core/a.json"),
        drop("core/b.json"),
        // Not a loaded file: an unreadable upload, or a Tokens Studio
        // combined export that expanded into set-named files.
        drop("core/broken.json"),
        notice("tokens.json", "Tokens Studio combined exports expanded into token sets"),
      ],
      [],
      files,
    );
    expect(d.dropped.map((w) => w.file)).toEqual(["core/a.json", "core/broken.json"]);
    expect(d.notices).toEqual([
      { kind: "Tokens Studio combined exports expanded into token sets", count: 1 },
    ]);
  });

  it("counts plan-stage warnings alongside parse-stage ones", () => {
    const d = diagnose([drop("core/a.json")], [drop("core/a.json", "y")], files);
    expect(d.dropped).toHaveLength(2);
  });
});

describe("diagnose — notices", () => {
  it("collapse to one line per kind, most frequent first", () => {
    const d = diagnose(
      [notice("core/a.json", "percent values treated as fractions")],
      [
        notice("core/a.json", "filled", "p"),
        notice("core/a.json", "filled", "q"),
      ],
      files,
    );
    expect(d.notices).toEqual([
      { kind: "filled", count: 2 },
      { kind: "percent values treated as fractions", count: 1 },
    ]);
  });

  it("fall back to the reason when no summary is set", () => {
    const d = diagnose([{ file: "core/a.json", path: "x", reason: "r", level: "notice" }], [], files);
    expect(d.notices).toEqual([{ kind: "r", count: 1 }]);
  });
});

describe("diagnose — console lines", () => {
  it("log every counted warning per token: drops red, notices dim", () => {
    const d = diagnose(
      [drop("core/a.json", "p"), drop("core/b.json")],
      [notice("core/a.json", "filled", "q")],
      files,
    );
    expect(d.consoleLines).toEqual([
      { text: "core/a.json · p — dropped", tone: "err" },
      { text: "core/a.json · q — filled (q)", tone: "dim" },
    ]);
  });
});
