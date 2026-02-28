"use client";

import { useState } from "react";

interface PlanApprovalBlockProps {
  status: "pending" | "approved" | "rejected";
  feedback?: string;
  onApprove?: () => void;
  onReject?: (feedback: string) => void;
}

export default function PlanApprovalBlock({
  status,
  feedback,
  onApprove,
  onReject,
}: PlanApprovalBlockProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  // ── Approved state ──
  if (status === "approved") {
    return (
      <div className="my-3 flex items-center gap-2 px-4 py-3 rounded-lg bg-success/10 border border-success/20">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-success flex-shrink-0">
          <path d="M3 8.5l3.5 3.5L13 4" />
        </svg>
        <span className="text-sm text-success font-medium">Plan approved</span>
      </div>
    );
  }

  // ── Rejected state ──
  if (status === "rejected") {
    return (
      <div className="my-3 px-4 py-3 rounded-lg bg-error/10 border border-error/20 space-y-1">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-error flex-shrink-0">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
          <span className="text-sm text-error font-medium">Plan rejected</span>
        </div>
        {feedback && (
          <p className="text-xs text-text-secondary ml-6">{feedback}</p>
        )}
      </div>
    );
  }

  // ── Pending state (with optional feedback input) ──
  return (
    <div className="my-3 rounded-lg border border-accent/30 bg-accent/5 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent flex-shrink-0">
          <rect x="2" y="2" width="12" height="12" rx="2" />
          <path d="M5 6h6M5 8.5h6M5 11h3" />
        </svg>
        <span className="text-sm font-medium text-text-primary">
          Plan ready for review
        </span>
      </div>

      {/* Feedback input (shown when reject is clicked) */}
      {showFeedback && (
        <div className="px-4 pb-2">
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="What should be changed?"
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded-md resize-none focus:outline-none focus:border-accent/50 text-text-primary placeholder:text-text-muted"
            rows={2}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && feedbackText.trim()) {
                onReject?.(feedbackText.trim());
              }
              if (e.key === "Escape") {
                setShowFeedback(false);
                setFeedbackText("");
              }
            }}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 pb-3 flex items-center gap-2">
        {!showFeedback ? (
          <>
            <button
              onClick={onApprove}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-success/15 text-success hover:bg-success/25 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 8.5l3.5 3.5L13 4" />
              </svg>
              Approve
            </button>
            <button
              onClick={() => setShowFeedback(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-error/10 text-error/80 hover:bg-error/20 hover:text-error transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
              Reject
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                if (feedbackText.trim()) {
                  onReject?.(feedbackText.trim());
                }
              }}
              disabled={!feedbackText.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-error/15 text-error hover:bg-error/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send feedback
            </button>
            <button
              onClick={() => {
                setShowFeedback(false);
                setFeedbackText("");
              }}
              className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
