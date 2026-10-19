import { describe, it, expect } from "vitest";
import {
  resolvePlayerKeyAction,
  clampSeek,
  isTypingTarget,
} from "../playerKeys";

describe("playerKeys - resolvePlayerKeyAction", () => {
  it("resolves plain ArrowLeft and ArrowRight to -5s and +5s seek", () => {
    expect(
      resolvePlayerKeyAction({
        key: "ArrowLeft",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "seek", delta: -5 });

    expect(
      resolvePlayerKeyAction({
        key: "ArrowRight",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "seek", delta: 5 });
  });

  it("resolves Alt+ArrowLeft and Alt+ArrowRight to fine -1s and +1s seek", () => {
    expect(
      resolvePlayerKeyAction({
        key: "ArrowLeft",
        shiftKey: false,
        altKey: true,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "seek", delta: -1 });

    expect(
      resolvePlayerKeyAction({
        key: "ArrowRight",
        shiftKey: false,
        altKey: true,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "seek", delta: 1 });
  });

  it("resolves Shift+ArrowLeft and Shift+ArrowRight to navigation", () => {
    expect(
      resolvePlayerKeyAction({
        key: "ArrowLeft",
        shiftKey: true,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "nav", dir: "prev" });

    expect(
      resolvePlayerKeyAction({
        key: "ArrowRight",
        shiftKey: true,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "nav", dir: "next" });
  });

  it("resolves bracket keys [ and ] to navigation", () => {
    expect(
      resolvePlayerKeyAction({
        key: "[",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "nav", dir: "prev" });

    expect(
      resolvePlayerKeyAction({
        key: "]",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "nav", dir: "next" });
  });

  it("resolves J and L to -10s and +10s seek", () => {
    expect(
      resolvePlayerKeyAction({
        key: "j",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "seek", delta: -10 });

    expect(
      resolvePlayerKeyAction({
        key: "J",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "seek", delta: -10 });

    expect(
      resolvePlayerKeyAction({
        key: "l",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "seek", delta: 10 });

    expect(
      resolvePlayerKeyAction({
        key: "L",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "seek", delta: 10 });
  });

  it("resolves spacebar to toggle-play", () => {
    expect(
      resolvePlayerKeyAction({
        key: " ",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "toggle-play" });

    expect(
      resolvePlayerKeyAction({
        key: "Spacebar",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "toggle-play" });
  });

  it("resolves M or m to toggle-mute", () => {
    expect(
      resolvePlayerKeyAction({
        key: "m",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "toggle-mute" });

    expect(
      resolvePlayerKeyAction({
        key: "M",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({ type: "toggle-mute" });
  });

  it("ignores any combination with ctrlKey or metaKey", () => {
    expect(
      resolvePlayerKeyAction({
        key: "ArrowRight",
        shiftKey: false,
        altKey: false,
        ctrlKey: true,
        metaKey: false,
      })
    ).toBeNull();

    expect(
      resolvePlayerKeyAction({
        key: "ArrowLeft",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: true,
      })
    ).toBeNull();

    expect(
      resolvePlayerKeyAction({
        key: "j",
        shiftKey: false,
        altKey: false,
        ctrlKey: true,
        metaKey: false,
      })
    ).toBeNull();
  });

  it("returns null for unrelated keys", () => {
    expect(
      resolvePlayerKeyAction({
        key: "Enter",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toBeNull();

    expect(
      resolvePlayerKeyAction({
        key: "a",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toBeNull();
  });
});

describe("playerKeys - clampSeek", () => {
  it("clamps between 0 and duration", () => {
    expect(clampSeek(10, 5, 100)).toBe(15);
    expect(clampSeek(2, -5, 100)).toBe(0);
    expect(clampSeek(98, 5, 100)).toBe(100);
  });

  it("handles non-finite duration by only clamping lower bound to 0", () => {
    expect(clampSeek(50, 10, Infinity)).toBe(60);
    expect(clampSeek(5, -10, NaN)).toBe(0);
  });
});

describe("playerKeys - isTypingTarget", () => {
  it("identifies input, textarea, and select elements", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const div = document.createElement("div");

    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("identifies isContentEditable elements", () => {
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });
});
