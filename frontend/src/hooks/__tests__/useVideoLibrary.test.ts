import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useVideoLibrary, EXPORTS_UPDATED_EVENT } from "../useVideoLibrary";

const mockGetExportedVideos = vi.fn();
const mockGetVideosFromFolders = vi.fn();
const mockLoadConfig = vi.fn();
const eventHandlers = new Map<string, Array<(...args: unknown[]) => void>>();

vi.mock("../../../wailsjs/go/backend/App", () => ({
  GetVideosFromFolders: (...args: unknown[]) => mockGetVideosFromFolders(...args),
  GetExportedVideos: (...args: unknown[]) => mockGetExportedVideos(...args),
  AddFolder: vi.fn(),
  RemoveFolder: vi.fn(),
  LoadConfig: (...args: unknown[]) => mockLoadConfig(...args),
  SaveFolders: vi.fn(),
}));

vi.mock("../../../wailsjs/runtime/runtime", () => ({
  EventsOn: (event: string, cb: (...args: unknown[]) => void) => {
    const list = eventHandlers.get(event) ?? [];
    list.push(cb);
    eventHandlers.set(event, list);
    return () => {
      const current = eventHandlers.get(event) ?? [];
      eventHandlers.set(
        event,
        current.filter((h) => h !== cb),
      );
    };
  },
}));

vi.mock("../../components/ui/ToastContainer", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

describe("useVideoLibrary - exportedPendingPaths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
    mockLoadConfig.mockResolvedValue({ folders: ["/videos"] });
    mockGetVideosFromFolders.mockResolvedValue([]);
  });

  it("loads pending exported source paths on mount", async () => {
    mockGetExportedVideos.mockResolvedValue([
      { sourcePath: "/videos/clip1.mp4", status: "exported" },
      { sourcePath: "/videos/clip2.mp4", status: "applied" },
    ]);

    const { result } = renderHook(() => useVideoLibrary());

    await waitFor(() => {
      expect(result.current.exportedPendingPaths.has("/videos/clip1.mp4")).toBe(true);
    });
    expect(result.current.exportedPendingPaths.has("/videos/clip2.mp4")).toBe(false);
    expect(mockGetExportedVideos).toHaveBeenCalledWith("exported");
  });

  it("refreshes exportedPendingPaths on youtube:sync-done and EXPORTS_UPDATED_EVENT", async () => {
    mockGetExportedVideos
      .mockResolvedValueOnce([{ sourcePath: "/videos/clip1.mp4", status: "exported" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ sourcePath: "/videos/clip3.mp4", status: "exported" }]);

    const { result } = renderHook(() => useVideoLibrary());

    await waitFor(() => {
      expect(result.current.exportedPendingPaths.has("/videos/clip1.mp4")).toBe(true);
    });

    await act(async () => {
      for (const cb of eventHandlers.get("youtube:sync-done") ?? []) {
        cb();
      }
    });

    await waitFor(() => {
      expect(result.current.exportedPendingPaths.has("/videos/clip1.mp4")).toBe(false);
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent(EXPORTS_UPDATED_EVENT));
    });

    await waitFor(() => {
      expect(result.current.exportedPendingPaths.has("/videos/clip3.mp4")).toBe(true);
    });
  });
});
