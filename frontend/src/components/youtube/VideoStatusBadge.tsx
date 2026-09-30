import React from "react";

interface VideoStatusBadgeProps {
  monetizationStatus?:
    "monetized" | "limited" | "demonetized" | "unknown" | string;
  rejectionReason?: string;
  statusIssues?: string[];
  compact?: boolean;
}

const REASON_LABELS: Record<string, string> = {
  copyright: "Copyright claim",
  claim: "Content claim",
  termsofuse: "Terms of use violation",
  inappropriate: "Inappropriate content",
  duplicate: "Duplicate video",
  age_restricted: "Age restricted",
  region_restricted: "Region restricted",
  rejected: "Rejected",
  failed: "Processing failed",
};

export default function VideoStatusBadge({
  monetizationStatus = "monetized",
  rejectionReason = "",
  statusIssues = [],
  compact = false,
}: VideoStatusBadgeProps) {
  let issuesList = [
    ...(rejectionReason ? [rejectionReason] : []),
    ...(statusIssues || []).filter(
      (i) => i.toLowerCase() !== rejectionReason.toLowerCase(),
    ),
  ];

  if (rejectionReason && issuesList.includes("rejected")) {
    issuesList = issuesList.filter((i) => i !== "rejected");
  }

  const uniqueIssues = Array.from(new Set(issuesList));
  const detailedIssues = uniqueIssues
    .map((r) => REASON_LABELS[r.toLowerCase()] || r.replace(/_/g, " "))
    .join(" • ");

  const normalizedStatus = (monetizationStatus || "monetized").toLowerCase();

  let title = "";
  let colorClass = "";
  let iconType: "yellow" | "red" | null = null;

  if (
    normalizedStatus === "demonetized" ||
    uniqueIssues.includes("copyright") ||
    uniqueIssues.includes("claim") ||
    uniqueIssues.includes("rejected") ||
    uniqueIssues.includes("failed")
  ) {
    colorClass = "text-rose-500 bg-rose-500/10 border-rose-500/30";
    iconType = "red";
    title = detailedIssues ? `Demonetized • ${detailedIssues}` : "Demonetized";
  } else if (
    normalizedStatus === "limited" ||
    uniqueIssues.includes("age_restricted") ||
    uniqueIssues.includes("region_restricted")
  ) {
    colorClass = "text-amber-400 bg-amber-400/10 border-amber-400/30";
    iconType = "yellow";
    title = detailedIssues
      ? `Limited monetization • ${detailedIssues}`
      : "Limited monetization";
  } else {
    return null;
  }

  return (
    <span
      data-testid="video-status-badge"
      title={title}
      className={`inline-flex items-center justify-center rounded-full font-bold select-none border transition-colors shrink-0 ${
        compact ? "w-3.5 h-3.5 text-[9px]" : "w-4 h-4 text-[10px]"
      } ${colorClass}`}
    >
      {iconType === "red" ? (
        <svg
          width={compact ? "9" : "10"}
          height={compact ? "9" : "10"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          <line x1="3" y1="3" x2="21" y2="21" />
        </svg>
      ) : (
        <span className="leading-none">$</span>
      )}
    </span>
  );
}
