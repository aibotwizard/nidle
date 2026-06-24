import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { RawUpload } from "../../src/shared/intake/types.js";

/**
 * Shared fixture loader for `tests/fixtures/<name>/`. Walks the
 * fixture directory, returns each `.json` as a RawUpload alongside the
 * fixture's `expected.json` payload.
 *
 * Tests then funnel through the production `fromUploads` to produce
 * `FileTokens[]` — same intake path as the UI.
 */
export function loadFixtureUploads(name: string): {
  uploads: RawUpload[];
  expected: any;
} {
  const base = join(__dirname, name);
  const expected = JSON.parse(readFileSync(join(base, "expected.json"), "utf8"));
  const uploads: RawUpload[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (e.endsWith(".json") && e !== "expected.json") {
        uploads.push({
          path: relative(base, full).split(/[/\\]/).join("/"),
          json: JSON.parse(readFileSync(full, "utf8")),
        });
      }
    }
  };
  walk(base);
  return { uploads, expected };
}
