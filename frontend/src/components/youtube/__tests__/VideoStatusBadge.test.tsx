import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import VideoStatusBadge from "../VideoStatusBadge";

describe("VideoStatusBadge", () => {
  it("does not render badge (returns null) when video has no issues and is monetized", () => {
    render(<VideoStatusBadge monetizationStatus="monetized" />);
    expect(screen.queryByTestId("video-status-badge")).not.toBeInTheDocument();
  });

  it("renders limited monetization badge (yellow) when limited or age restricted", () => {
    render(
      <VideoStatusBadge
        monetizationStatus="limited"
        statusIssues={["age_restricted"]}
      />,
    );
    const badge = screen.getByTestId("video-status-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      "title",
      "Limited monetization • Age restricted",
    );
    expect(badge.className).toContain("text-amber-400");
  });

  it("renders demonetized / copyright badge (red) when copyright claim exists", () => {
    render(
      <VideoStatusBadge
        monetizationStatus="demonetized"
        rejectionReason="copyright"
        statusIssues={["rejected", "copyright"]}
      />,
    );
    const badge = screen.getByTestId("video-status-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "Demonetized • Copyright claim");
    expect(badge.className).toContain("text-rose-500");
  });

  it("renders custom reason in tooltip when available", () => {
    render(
      <VideoStatusBadge
        monetizationStatus="demonetized"
        rejectionReason="termsOfUse"
        statusIssues={["termsOfUse"]}
      />,
    );
    const badge = screen.getByTestId("video-status-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      "title",
      "Demonetized • Terms of use violation",
    );
    expect(badge.className).toContain("text-rose-500");
  });
});
