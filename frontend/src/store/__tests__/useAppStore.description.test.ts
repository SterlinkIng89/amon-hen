import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../useAppStore";

describe("useAppStore defaultVideoDescription", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults defaultVideoDescription to an empty string", () => {
    const state = useAppStore.getState();
    expect(state.defaultVideoDescription).toBe("");
  });

  it("updates defaultVideoDescription and persists to localStorage", () => {
    const store = useAppStore.getState();
    store.setDefaultVideoDescription("Gameplay ultrawide 3440x1440p\nPC Specs: RTX 4090");

    const updatedState = useAppStore.getState();
    expect(updatedState.defaultVideoDescription).toBe(
      "Gameplay ultrawide 3440x1440p\nPC Specs: RTX 4090"
    );

    const rawPrefs = localStorage.getItem("amon-hen-prefs");
    expect(rawPrefs).not.toBeNull();
    const parsed = JSON.parse(rawPrefs ?? "{}");
    expect(parsed.defaultVideoDescription).toBe(
      "Gameplay ultrawide 3440x1440p\nPC Specs: RTX 4090"
    );
  });
});
