import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  useThumbnailHistory,
  cloneThumbnailConfig,
  isThumbnailConfigEqual,
  buildConfigRestorePatch,
  isEditableKeyboardTarget,
} from "../useThumbnailHistory";
import { TagThumbnailConfig } from "../../types";

describe("useThumbnailHistory helper functions", () => {
  const sampleConfig: TagThumbnailConfig = {
    enabled: true,
    source_type: "steam",
    steam_asset_type: "header",
    episode_position: "bottom-left",
    episode_format: "pad2",
    font_color: "#ffffff",
    image_framing: { offset_x: 0.5, offset_y: 0.5, zoom: 1 },
    logo: { enabled: true, x: 0.2, y: 0.2, scale: 1 },
    title: { enabled: true, x: 0.5, y: 0.85, scale: 1, text_override: "Test" },
  };

  it("cloneThumbnailConfig creates a deep clone of nested objects", () => {
    const cloned = cloneThumbnailConfig(sampleConfig);
    expect(cloned).toEqual(sampleConfig);
    expect(cloned).not.toBe(sampleConfig);
    expect(cloned.image_framing).not.toBe(sampleConfig.image_framing);
    expect(cloned.logo).not.toBe(sampleConfig.logo);
    expect(cloned.title).not.toBe(sampleConfig.title);
  });

  it("isThumbnailConfigEqual correctly identifies identical and modified configs", () => {
    const clone = cloneThumbnailConfig(sampleConfig);
    expect(isThumbnailConfigEqual(sampleConfig, clone)).toBe(true);

    const changed = {
      ...sampleConfig,
      image_framing: { ...sampleConfig.image_framing!, offset_x: 0.8 },
    };
    expect(isThumbnailConfigEqual(sampleConfig, changed)).toBe(false);

    expect(isThumbnailConfigEqual(undefined, undefined)).toBe(true);
    expect(isThumbnailConfigEqual(sampleConfig, undefined)).toBe(false);
  });

  it("buildConfigRestorePatch generates explicit undefined for removed properties", () => {
    const current: TagThumbnailConfig = {
      ...sampleConfig,
      logo: { enabled: true, x: 0.3, y: 0.3, scale: 1 },
    };
    const target: Partial<TagThumbnailConfig> = {
      enabled: true,
      source_type: "steam",
      // logo omitted in target
    };

    const patch = buildConfigRestorePatch(current, target);
    expect(patch.logo).toBeUndefined();
    expect("logo" in patch).toBe(true);
  });

  it("isEditableKeyboardTarget identifies inputs, textareas, selects, and contenteditable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const divEditable = document.createElement("div");
    divEditable.contentEditable = "true";
    const normalDiv = document.createElement("div");

    expect(isEditableKeyboardTarget(input)).toBe(true);
    expect(isEditableKeyboardTarget(textarea)).toBe(true);
    expect(isEditableKeyboardTarget(select)).toBe(true);
    expect(isEditableKeyboardTarget(divEditable)).toBe(true);
    expect(isEditableKeyboardTarget(normalDiv)).toBe(false);
    expect(isEditableKeyboardTarget(null)).toBe(false);
  });
});

describe("useThumbnailHistory hook", () => {
  const initialConfig: Partial<TagThumbnailConfig> = {
    enabled: true,
    source_type: "steam",
    episode_position: "bottom-left",
    image_framing: { offset_x: 0.5, offset_y: 0.5, zoom: 1 },
  };

  it("initializes with empty past, empty future, and canUndo/canRedo as false", () => {
    const { result } = renderHook(() => useThumbnailHistory(initialConfig));

    expect(result.current.past).toHaveLength(0);
    expect(result.current.future).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.present).toEqual(initialConfig);
  });

  it("pushState pushes previous present to past and clears future", () => {
    const { result } = renderHook(() => useThumbnailHistory(initialConfig));

    const state2: Partial<TagThumbnailConfig> = {
      ...initialConfig,
      image_framing: { offset_x: 0.6, offset_y: 0.5, zoom: 1 },
    };

    act(() => {
      result.current.pushState(state2);
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.past).toHaveLength(1);
    expect(result.current.past[0]).toEqual(initialConfig);
    expect(result.current.present).toEqual(state2);
  });

  it("undo and redo cycle restores historical states correctly", () => {
    const { result } = renderHook(() => useThumbnailHistory(initialConfig));

    const state2: Partial<TagThumbnailConfig> = {
      ...initialConfig,
      image_framing: { offset_x: 0.6, offset_y: 0.5, zoom: 1 },
    };
    const state3: Partial<TagThumbnailConfig> = {
      ...initialConfig,
      image_framing: { offset_x: 0.7, offset_y: 0.5, zoom: 1 },
    };

    act(() => {
      result.current.pushState(state2);
    });
    act(() => {
      result.current.pushState(state3);
    });

    expect(result.current.past).toHaveLength(2);
    expect(result.current.canUndo).toBe(true);

    // Undo to state2
    let restored: Partial<TagThumbnailConfig> | null = null;
    act(() => {
      restored = result.current.undo();
    });

    expect(restored).toEqual(state2);
    expect(result.current.present).toEqual(state2);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.future).toHaveLength(1);

    // Undo to initialConfig
    act(() => {
      restored = result.current.undo();
    });

    expect(restored).toEqual(initialConfig);
    expect(result.current.present).toEqual(initialConfig);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.future).toHaveLength(2);

    // Redo to state2
    act(() => {
      restored = result.current.redo();
    });

    expect(restored).toEqual(state2);
    expect(result.current.present).toEqual(state2);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    // Pushing new state after undo clears future
    const state4: Partial<TagThumbnailConfig> = {
      ...initialConfig,
      font_color: "#ffd600",
    };
    act(() => {
      result.current.pushState(state4);
    });

    expect(result.current.present).toEqual(state4);
    expect(result.current.future).toHaveLength(0);
    expect(result.current.canRedo).toBe(false);
  });

  it("caps history at maxHistory limit", () => {
    const { result } = renderHook(() =>
      useThumbnailHistory(initialConfig, { maxHistory: 3 })
    );

    for (let i = 1; i <= 5; i++) {
      act(() => {
        result.current.pushState({
          ...initialConfig,
          image_framing: { offset_x: i * 0.1, offset_y: 0.5, zoom: 1 },
        });
      });
    }

    expect(result.current.past).toHaveLength(3);
    // Oldest items (offset_x 0.5 and 0.1) dropped
    expect(result.current.past[0].image_framing?.offset_x).toBeCloseTo(0.2);
    expect(result.current.past[1].image_framing?.offset_x).toBeCloseTo(0.3);
    expect(result.current.past[2].image_framing?.offset_x).toBeCloseTo(0.4);
    expect(result.current.present.image_framing?.offset_x).toBeCloseTo(0.5);
  });

  it("groups batch operations (beginBatch, updateBatchPreview, commitBatch) into a single history snapshot", () => {
    const { result } = renderHook(() => useThumbnailHistory(initialConfig));

    act(() => {
      result.current.beginBatch();
      result.current.updateBatchPreview({
        ...initialConfig,
        image_framing: { offset_x: 0.51, offset_y: 0.5, zoom: 1 },
      });
      result.current.updateBatchPreview({
        ...initialConfig,
        image_framing: { offset_x: 0.55, offset_y: 0.5, zoom: 1 },
      });
      result.current.updateBatchPreview({
        ...initialConfig,
        image_framing: { offset_x: 0.6, offset_y: 0.5, zoom: 1 },
      });
      result.current.commitBatch();
    });

    expect(result.current.past).toHaveLength(1);
    expect(result.current.past[0]).toEqual(initialConfig);
    expect(result.current.present.image_framing?.offset_x).toBe(0.6);
  });

  it("does not create a history entry if commitBatch has no net changes", () => {
    const { result } = renderHook(() => useThumbnailHistory(initialConfig));

    act(() => {
      result.current.beginBatch();
      result.current.updateBatchPreview(initialConfig);
      result.current.commitBatch();
    });

    expect(result.current.past).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
  });

  it("resets history when resetKey option changes", () => {
    let resetKey = "tag-1";
    const { result, rerender } = renderHook(
      ({ rKey }) => useThumbnailHistory(initialConfig, { resetKey: rKey }),
      { initialProps: { rKey: resetKey } }
    );

    act(() => {
      result.current.pushState({
        ...initialConfig,
        image_framing: { offset_x: 0.8, offset_y: 0.5, zoom: 1 },
      });
    });
    expect(result.current.canUndo).toBe(true);

    resetKey = "tag-2";
    rerender({ rKey: resetKey });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.past).toHaveLength(0);
    expect(result.current.future).toHaveLength(0);
  });
});
