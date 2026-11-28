import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { useAppStore } from "../store/useAppStore";
import * as appBackend from "../../wailsjs/go/backend/App";

vi.mock("../pages/Dashboard", () => ({
  default: () => <div data-testid="mock-dashboard" />,
}));

vi.mock("../../wailsjs/go/backend/App", () => ({
  LoadConfig: vi.fn().mockResolvedValue({
    folders: [],
    game_profiles: {},
    tag_playlists: {},
    default_video_description: "",
  }),
  LogFrontendEvent: vi.fn(),
  SetDefaultVideoDescription: vi.fn().mockResolvedValue(undefined),
}));

describe("App startup config hydration (#213)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAppStore.setState({ defaultVideoDescription: "" });
  });

  it("hydrates defaultVideoDescription from backend LoadConfig on mount", async () => {
    vi.mocked(appBackend.LoadConfig).mockResolvedValueOnce({
      folders: [],
      game_profiles: {},
      tag_playlists: {},
      default_video_description: "Saved in backend config.json",
    } as never);

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().defaultVideoDescription).toBe(
        "Saved in backend config.json",
      );
    });
    expect(appBackend.SetDefaultVideoDescription).not.toHaveBeenCalled();
  });

  it("migrates legacy localStorage defaultVideoDescription to backend when backend config is empty", async () => {
    useAppStore.setState({ defaultVideoDescription: "Legacy localStorage desc" });
    vi.mocked(appBackend.LoadConfig).mockResolvedValueOnce({
      folders: [],
      game_profiles: {},
      tag_playlists: {},
      default_video_description: "",
    } as never);

    render(<App />);

    await waitFor(() => {
      expect(appBackend.SetDefaultVideoDescription).toHaveBeenCalledWith(
        "Legacy localStorage desc",
      );
    });
  });
});
