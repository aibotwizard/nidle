import { describe, expect, it } from "vitest";
import { resolveTokens } from "../src/shared/dtcg/resolve.js";
import type { Token } from "../src/shared/dtcg/types.js";

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
