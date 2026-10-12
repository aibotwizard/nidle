import { describe, expect, it } from "vitest";
import { resolveTokens } from "../src/shared/dtcg/resolve.js";
import type { DtcgType, Token } from "../src/shared/dtcg/types.js";

function t(
  name: string,
  type: Token["type"],
  value: string | number,
  file = "x.json",
): Token {
  return { name, type, value, file };
}

describe("resolveTokens — keepAlias", () => {
  it("preserves literals untouched", () => {
    const { tokens, warnings } = resolveTokens(
      [t("color/blue/500", "color", "#0D99FF")],
      "keepAlias",
    );
    expect(warnings).toEqual([]);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.value).toEqual({ kind: "literal", value: "#0D99FF" });
  });

  it("converts {a.b.c} aliases to {kind:'alias', targetName:'a/b/c'}", () => {
    const { tokens, warnings } = resolveTokens(
      [
        t("color/blue/500", "color", "#0D99FF"),
        t("accent/primary", "color", "{color.blue.500}"),
      ],
      "keepAlias",
    );
    expect(warnings).toEqual([]);
    const accent = tokens.find((x) => x.name === "accent/primary")!;
    expect(accent.value).toEqual({
      kind: "alias",
      targetName: "color/blue/500",
    });
  });

  it("preserves the author's direct alias hop (a → b, not collapsed to a → c)", () => {
    const { tokens, warnings } = resolveTokens(
      [
        t("c", "color", "#000000"),
        t("b", "color", "{c}"),
        t("a", "color", "{b}"),
      ],
      "keepAlias",
    );
    expect(warnings).toEqual([]);
    const a = tokens.find((x) => x.name === "a")!;
    expect(a.value).toEqual({ kind: "alias", targetName: "b" });
    const b = tokens.find((x) => x.name === "b")!;
    expect(b.value).toEqual({ kind: "alias", targetName: "c" });
  });
});

describe("resolveTokens — resolve mode", () => {
  it("substitutes alias values with the literal at the chain tip", () => {
    const { tokens, warnings } = resolveTokens(
      [
        t("color/blue/500", "color", "#0D99FF"),
        t("accent/primary", "color", "{color.blue.500}"),
        t("button/bg", "color", "{accent.primary}"),
      ],
      "resolve",
    );
    expect(warnings).toEqual([]);
    const button = tokens.find((x) => x.name === "button/bg")!;
    expect(button.value).toEqual({ kind: "literal", value: "#0D99FF" });
  });
});

describe("resolveTokens — error cases", () => {
  it("warns and drops aliases pointing at a missing target", () => {
    const { tokens, warnings } = resolveTokens(
      [t("accent/primary", "color", "{color.blue.999}")],
      "keepAlias",
    );
    expect(tokens).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toMatch(/does not match any token/);
  });

  it("warns on alias cycles", () => {
    const { tokens, warnings } = resolveTokens(
      [
        t("a", "color", "{b}"),
        t("b", "color", "{a}"),
      ],
      "keepAlias",
    );
    expect(tokens).toEqual([]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]!.reason).toMatch(/cycle/);
  });

  it("warns when alias target type differs", () => {
    const { tokens, warnings } = resolveTokens(
      [
        t("foo/dim", "dimension", 16),
        t("bar/col", "color", "{foo.dim}"),
      ],
      "keepAlias",
    );
    expect(tokens.find((x) => x.name === "bar/col")).toBeUndefined();
    expect(warnings.some((w) => /type dimension, expected color/.test(w.reason))).toBe(true);
  });
});

describe("resolveTokens — untyped alias tokens (spec §5.2.2 rule 1)", () => {
  it("adopts the target's type instead of warning", () => {
    const { tokens, warnings } = resolveTokens(
      [
        t("sizes/1", "dimension", 1, "core/sizes.json"),
        t("btn/border-width", null, "{sizes.1}", "component/btn.json"),
      ],
      "keepAlias",
    );
    expect(warnings).toEqual([]);
    expect(tokens.find((x) => x.name === "btn/border-width")).toEqual({
      name: "btn/border-width",
      type: "dimension",
      file: "component/btn.json",
      value: { kind: "alias", targetName: "sizes/1" },
    });
  });

  it("adopts the chain-tip type through a multi-hop untyped chain", () => {
    const { tokens } = resolveTokens(
      [
        t("color/blue/500", "color", "#0D99FF"),
        t("accent/primary", null, "{color.blue.500}"),
        t("btn/bg", null, "{accent.primary}"),
      ],
      "resolve",
    );
    expect(tokens.find((x) => x.name === "btn/bg")).toEqual({
      name: "btn/bg",
      type: "color",
      file: "x.json",
      value: { kind: "literal", value: "#0D99FF" },
    });
  });
});

describe("negated aliases resolve to a negative literal (D-14)", () => {
  const tok = (name: string, type: DtcgType | null, value: string | number): Token => ({
    name,
    type,
    value,
    file: "t.json",
  });

  it("reads the target's literal and negates it, in either mode", () => {
    for (const mode of ["keepAlias", "resolve"] as const) {
      const r = resolveTokens(
        [tok("sizes/8", "dimension", 8), tok("margin", "dimension", "-{sizes.8}")],
        mode,
      );
      const margin = r.tokens.find((t) => t.name === "margin")!;
      // No alias edge survives — Figma has no computed variables.
      expect(margin.value, mode).toEqual({ kind: "literal", value: -8 });
      expect(r.warnings, mode).toHaveLength(1);
      expect(r.warnings[0]!.level, mode).toBe("notice");
      expect(r.warnings[0]!.reason, mode).toContain("resolved to -8");
    }
  });

  it("follows a chain to the literal before negating", () => {
    const r = resolveTokens(
      [
        tok("sizes/8", "dimension", 8),
        tok("space/s", "dimension", "{sizes.8}"),
        tok("margin", "dimension", "-{space.s}"),
      ],
      "keepAlias",
    );
    expect(r.tokens.find((t) => t.name === "margin")!.value).toEqual({
      kind: "literal",
      value: -8,
    });
  });

  it("warns and drops when the target is missing or not numeric", () => {
    const missing = resolveTokens([tok("margin", "dimension", "-{nope}")], "keepAlias");
    expect(missing.tokens).toEqual([]);
    expect(missing.warnings[0]!.reason).toContain("does not match any token");
    expect(missing.warnings[0]!.level).toBeUndefined();

    const nonNumeric = resolveTokens(
      [tok("brand", "text", "Grotesk"), tok("margin", "dimension", "-{brand}")],
      "keepAlias",
    );
    expect(nonNumeric.tokens.map((t) => t.name)).toEqual(["brand"]);
    expect(nonNumeric.warnings[0]!.reason).toContain("is not numeric");
  });
});
