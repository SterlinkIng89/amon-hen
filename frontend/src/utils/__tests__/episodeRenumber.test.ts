import { describe, it, expect } from "vitest";
import { renumberAfterReorder } from "../episodeRenumber";

describe("renumberAfterReorder", () => {
  it("resolves two duplicates at ep 26 and shifts following episodes by +1", () => {
    const input: Record<string, number> = {
      vid25: 25,
      vid26a: 26,
      vid26b: 26,
      vid27: 27,
      vid28: 28,
      vid29: 29,
    };

    const result = renumberAfterReorder(input, 26, ["vid26a", "vid26b"]);

    expect(result).toEqual({
      vid25: 25,
      vid26a: 26,
      vid26b: 27,
      vid27: 28,
      vid28: 29,
      vid29: 30,
    });
  });

  it("respects custom order when resolving duplicates", () => {
    const input: Record<string, number> = {
      vid25: 25,
      vid26a: 26,
      vid26b: 26,
      vid27: 27,
    };

    // Swap: vid26b becomes 26, vid26a becomes 27
    const result = renumberAfterReorder(input, 26, ["vid26b", "vid26a"]);

    expect(result).toEqual({
      vid25: 25,
      vid26b: 26,
      vid26a: 27,
      vid27: 28,
    });
  });

  it("handles three duplicates at the same episode and shifts following by +2", () => {
    const input: Record<string, number> = {
      v10: 10,
      v11a: 11,
      v11b: 11,
      v11c: 11,
      v12: 12,
      v15: 15, // gaps preserved with shift
    };

    const result = renumberAfterReorder(input, 11, ["v11b", "v11c", "v11a"]);

    expect(result).toEqual({
      v10: 10,
      v11b: 11,
      v11c: 12,
      v11a: 13,
      v12: 14,
      v15: 17,
    });
  });

  it("does not mutate the original input map", () => {
    const input: Record<string, number> = {
      a: 5,
      b: 5,
      c: 6,
    };
    const copy = { ...input };

    renumberAfterReorder(input, 5, ["a", "b"]);

    expect(input).toEqual(copy);
  });

  it("leaves zero, negative, or unassigned episodes untouched", () => {
    const input: Record<string, number> = {
      v0: 0,
      vNeg: -1,
      v26a: 26,
      v26b: 26,
      v27: 27,
    };

    const result = renumberAfterReorder(input, 26, ["vidUnknown", "v26a", "v26b"]);

    expect(result.v0).toBe(0);
    expect(result.vNeg).toBe(-1);
    expect(result.v26a).toBe(27);
    expect(result.v26b).toBe(28);
    expect(result.v27).toBe(29);
  });
});
