import { describe, expect, it } from "vitest";
import { fromDrop, fromPicker } from "../../src/ui/io/intake.js";

/**
 * The path contract (req-0002 / FR-106): every upload path is relative
 * to the upload root and never contains the root itself — regardless of
 * whether the files arrived via the picker or a drop.
 */

const JSON_A = { color: { blue: { $type: "color", $value: "#0d99ff" } } };

function pickerFile(rel: string, body: string = JSON.stringify(JSON_A)): File {
  const name = rel.split("/").pop()!;
  const f = new File([body], name, { type: "application/json" });
  Object.defineProperty(f, "webkitRelativePath", { value: rel, configurable: true });
  return f;
}

/* Duck-typed FileSystemEntry fakes — the drop walker only touches
   isFile/isDirectory/name/file()/createReader(). */
type FakeEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (cb: (f: File) => void) => void;
  createReader?: () => { readEntries: (cb: (batch: FakeEntry[]) => void) => void };
};

function fileEntry(name: string, content: string): FakeEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (cb) => cb(new File([content], name)),
  };
}

function dirEntry(name: string, children: FakeEntry[]): FakeEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let delivered = false;
      return {
        readEntries: (cb) => {
          const batch = delivered ? [] : children;
          delivered = true;
          cb(batch);
        },
      };
    },
  };
}

function dropOf(entries: FakeEntry[], looseFiles: File[] = []): DataTransfer {
  const items = [
    ...entries.map((e) => ({ webkitGetAsEntry: () => e, getAsFile: () => null })),
    ...looseFiles.map((f) => ({ webkitGetAsEntry: () => null, getAsFile: () => f })),
  ];
  return { items, files: [] } as unknown as DataTransfer;
}

const json = JSON.stringify(JSON_A);
const paths = (r: { uploads: { path: string }[] }) => r.uploads.map((u) => u.path).sort();

describe("fromPicker", () => {
  it("strips exactly the picked folder's own name", async () => {
    const r = await fromPicker([
      pickerFile("tokens/core/color.json"),
      pickerFile("tokens/semantic/light.json"),
    ]);
    expect(paths(r)).toEqual(["core/color.json", "semantic/light.json"]);
  });

  it("falls back to the file name without a relative path", async () => {
    const f = new File([json], "color.json");
    const r = await fromPicker([f]);
    expect(paths(r)).toEqual(["color.json"]);
  });

  it("ignores non-json files and captures bad JSON per file", async () => {
    const r = await fromPicker([
      pickerFile("tokens/core/color.json"),
      pickerFile("tokens/readme.txt"),
      pickerFile("tokens/broken.json", "{oops"),
    ]);
    expect(paths(r)).toEqual(["core/color.json"]);
    expect(r.parseFailures).toHaveLength(1);
    expect(r.parseFailures[0]!.path).toBe("broken.json");
    expect(r.parseFailures[0]!.reason).toContain("invalid JSON");
  });
});

describe("fromDrop", () => {
  it("treats a single dropped directory as the root (≡ picking it)", async () => {
    const tokens = dirEntry("tokens", [
      dirEntry("core", [fileEntry("color.json", json)]),
      dirEntry("semantic", [fileEntry("light.json", json)]),
    ]);
    const r = await fromDrop(dropOf([tokens]));
    expect(paths(r)).toEqual(["core/color.json", "semantic/light.json"]);
  });

  it("dropping the collection folder itself matches picking it", async () => {
    const core = dirEntry("core", [fileEntry("color.json", json)]);
    const dropped = await fromDrop(dropOf([core]));
    const picked = await fromPicker([pickerFile("core/color.json")]);
    expect(paths(dropped)).toEqual(paths(picked));
    expect(paths(dropped)).toEqual(["color.json"]);
  });

  it("keeps each item's name when several items are dropped", async () => {
    const r = await fromDrop(
      dropOf([
        dirEntry("core", [fileEntry("color.json", json)]),
        dirEntry("semantic", [fileEntry("light.json", json)]),
      ]),
    );
    expect(paths(r)).toEqual(["core/color.json", "semantic/light.json"]);
  });

  it("loose dropped files keep their names", async () => {
    const r = await fromDrop(dropOf([], [new File([json], "color.json")]));
    expect(paths(r)).toEqual(["color.json"]);
  });

  it("recurses nested directories with full prefixes", async () => {
    const r = await fromDrop(
      dropOf([
        dirEntry("brand", [dirEntry("core", [dirEntry("color", [fileEntry("blue.json", json)])])]),
        fileEntry("root.json", json) as never,
      ]),
    );
    expect(paths(r)).toEqual(["brand/core/color/blue.json", "root.json"]);
  });
});
