import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SteamMatchBadge } from "../SteamMatchBadge";

describe("SteamMatchBadge", () => {
  it("shows the game title and AppID when matched", () => {
    render(
      <SteamMatchBadge
        appId="3830"
        gameTitle="Psychonauts"
        isLoading={false}
        onOpenSelector={vi.fn()}
      />
    );
    expect(screen.getByText(/Steam matched: Psychonauts \(AppID 3830\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Change/ })).toBeInTheDocument();
  });

  it("falls back to the AppID when no title is available", () => {
    render(<SteamMatchBadge appId="3830" isLoading={false} onOpenSelector={vi.fn()} />);
    expect(screen.getByText(/Steam matched: AppID 3830/)).toBeInTheDocument();
  });

  it("shows the unmatched state with a link action", () => {
    render(<SteamMatchBadge appId={null} isLoading={false} onOpenSelector={vi.fn()} />);
    expect(screen.getByText("No Steam match found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Link Steam game/ })).toBeInTheDocument();
  });

  it("shows a loading state and disables the action", () => {
    render(<SteamMatchBadge appId={null} isLoading={true} onOpenSelector={vi.fn()} />);
    expect(screen.getByText("Checking Steam match...")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("calls onOpenSelector when the action is clicked", () => {
    const onOpenSelector = vi.fn();
    render(<SteamMatchBadge appId={null} isLoading={false} onOpenSelector={onOpenSelector} />);
    fireEvent.click(screen.getByRole("button", { name: /Link Steam game/ }));
    expect(onOpenSelector).toHaveBeenCalledTimes(1);
  });
});
