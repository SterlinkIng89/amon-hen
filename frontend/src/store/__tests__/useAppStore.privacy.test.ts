import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../useAppStore";

describe("useAppStore defaultVideoPrivacy", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults defaultPlaylistPrivacy to public and defaultVideoPrivacy to unlisted", () => {
    const state = useAppStore.getState();
    expect(state.defaultPlaylistPrivacy).toBe("public");
    expect(state.defaultVideoPrivacy).toBe("unlisted");
  });

  it("updates defaultVideoPrivacy independently and persists to localStorage", () => {
    const store = useAppStore.getState();
    store.setDefaultVideoPrivacy("public");

    const updatedState = useAppStore.getState();
    expect(updatedState.defaultVideoPrivacy).toBe("public");
    expect(updatedState.defaultPlaylistPrivacy).toBe("public");

    const rawPrefs = localStorage.getItem("amon-hen-prefs");
    expect(rawPrefs).not.toBeNull();
    const parsed = JSON.parse(rawPrefs ?? "{}");
    expect(parsed.defaultVideoPrivacy).toBe("public");
    expect(parsed.defaultPlaylistPrivacy).toBe("public");
  });
});
