import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SteamGameSelectorModal } from "../SteamGameSelectorModal";
import * as appBackend from "../../../../../wailsjs/go/backend/App";
import { backend } from "../../../../../wailsjs/go/models";

vi.mock("../../../../../wailsjs/go/backend/App", () => ({
  SearchSteamGames: vi.fn(),
  SetSteamAppID: vi.fn(),
}));

describe("SteamGameSelectorModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    render(
      <SteamGameSelectorModal
        isOpen={false}
        tag="Psychonauts"
        currentAppId="3830"
        onSelectAppId={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders modal header, current match, and triggers search", async () => {
    vi.mocked(appBackend.SearchSteamGames).mockResolvedValue([
      backend.SteamSearchResult.createFrom({
        appId: "3830",
        name: "Psychonauts",
        headerUrl: "https://example.com/p1.jpg",
      }),
      backend.SteamSearchResult.createFrom({
        appId: "607080",
        name: "Psychonauts 2",
        headerUrl: "https://example.com/p2.jpg",
      }),
    ]);

    render(
      <SteamGameSelectorModal
        isOpen={true}
        tag="Psychonauts"
        currentAppId="607080"
        currentGameTitle="Psychonauts 2"
        onSelectAppId={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Link Steam Game for “Psychonauts”/i)).toBeInTheDocument();
    expect(screen.getByText(/Psychonauts 2/i)).toBeInTheDocument();
    expect(screen.getByText(/\(AppID 607080\)/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(appBackend.SearchSteamGames).toHaveBeenCalledWith("Psychonauts");
    });

    await waitFor(() => {
      expect(screen.getByText("Psychonauts")).toBeInTheDocument();
    });
  });

  it("selects a game result and updates binding", async () => {
    vi.mocked(appBackend.SearchSteamGames).mockResolvedValue([
      backend.SteamSearchResult.createFrom({
        appId: "3830",
        name: "Psychonauts",
        headerUrl: "https://example.com/p1.jpg",
      }),
    ]);
    vi.mocked(appBackend.SetSteamAppID).mockResolvedValue(undefined);

    const onSelectAppId = vi.fn();
    const onClose = vi.fn();

    render(
      <SteamGameSelectorModal
        isOpen={true}
        tag="Psychonauts"
        currentAppId="607080"
        onSelectAppId={onSelectAppId}
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Select")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Select"));

    await waitFor(() => {
      expect(appBackend.SetSteamAppID).toHaveBeenCalledWith("Psychonauts", "3830");
      expect(onSelectAppId).toHaveBeenCalledWith("3830");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("applies a custom AppID directly", async () => {
    vi.mocked(appBackend.SearchSteamGames).mockResolvedValue([]);
    vi.mocked(appBackend.SetSteamAppID).mockResolvedValue(undefined);

    const onSelectAppId = vi.fn();
    const onClose = vi.fn();

    render(
      <SteamGameSelectorModal
        isOpen={true}
        tag="Psychonauts"
        currentAppId={null}
        onSelectAppId={onSelectAppId}
        onClose={onClose}
      />
    );

    const customInput = screen.getByPlaceholderText("e.g. 3830");
    fireEvent.change(customInput, { target: { value: "3830" } });

    const applyBtn = screen.getByText("Apply AppID");
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(appBackend.SetSteamAppID).toHaveBeenCalledWith("Psychonauts", "3830");
      expect(onSelectAppId).toHaveBeenCalledWith("3830");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("unlinks existing Steam AppID", async () => {
    vi.mocked(appBackend.SearchSteamGames).mockResolvedValue([]);
    vi.mocked(appBackend.SetSteamAppID).mockResolvedValue(undefined);

    const onSelectAppId = vi.fn();
    const onClose = vi.fn();

    render(
      <SteamGameSelectorModal
        isOpen={true}
        tag="Psychonauts"
        currentAppId="607080"
        onSelectAppId={onSelectAppId}
        onClose={onClose}
      />
    );

    const unlinkBtn = screen.getByText("Unlink");
    fireEvent.click(unlinkBtn);

    await waitFor(() => {
      expect(appBackend.SetSteamAppID).toHaveBeenCalledWith("Psychonauts", "");
      expect(onSelectAppId).toHaveBeenCalledWith(null);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
