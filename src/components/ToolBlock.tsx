"use client";

import { useState } from "react";

interface ToolBlockProps {
  toolName: string;
  input: Record<string, unknown>;
  isRunning: boolean;
  result?: { content: string; isError: boolean } | null;
}

function getToolSummary(
  toolName: string,
  input: Record<string, unknown>
): string {
  switch (toolName) {
    case "Bash":
      return `$ ${(input.command as string) || "..."}`;
    case "Read":
      return (input.file_path as string) || "Reading file...";
    case "Write":
      return (input.file_path as string) || "Writing file...";
    case "Edit":
      return (input.file_path as string) || "Editing file...";
    case "Glob":
      return (input.pattern as string) || "Searching files...";
    case "Grep":
      return `/${(input.pattern as string) || "..."}/ `;
    case "WebSearch":
      return (input.query as string) || "Searching web...";
    case "WebFetch":
      return (input.url as string) || "Fetching URL...";
    case "Task":
      return (input.description as string) || "Running task...";
    default:
      return `Running ${toolName}...`;
  }
}

function SmartInput({ toolName, input }: { toolName: string; input: Record<string, unknown> }) {
  if (toolName === "Bash" && input.command) {
    return (
      <div className="font-mono text-xs text-text-secondary bg-bg-primary rounded px-2.5 py-2 overflow-x-auto">
        <span className="text-text-muted select-none">$ </span>
        {input.command as string}
      </div>
    );
  }
  if ((toolName === "Read" || toolName === "Write" || toolName === "Edit") && input.file_path) {
    return (
      <div className="text-xs text-text-secondary font-mono truncate px-1">
        {input.file_path as string}
      </div>
    );
  }
  if (toolName === "Glob" && input.pattern) {
    return (
      <div className="text-xs text-text-secondary font-mono truncate px-1">
        {input.pattern as string}
      </div>
    );
  }
  if (toolName === "Grep" && input.pattern) {
    return (
      <div className="text-xs text-text-secondary font-mono truncate px-1">
        /{input.pattern as string}/
      </div>
    );
  }
  return (
    <pre className="text-xs text-text-secondary whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}

function CopySmall({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="text-[10px] text-text-muted hover:text-text-primary transition-colors flex items-center gap-0.5"
    >
      {copied ? (
        <>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 8.5l3.5 3.5L13 4" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="5" y="5" width="8" height="8" rx="1" />
            <path d="M3 11V3a1 1 0 011-1h8" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

export default function ToolBlock({
  toolName,
  input,
  isRunning,
  result,
}: ToolBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = getToolSummary(toolName, input);

  // --- Collapsed: ultra-compact single line ---
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 py-0.5 pl-2 w-full text-left border-l-2 border-accent/30 hover:border-accent/60 hover:bg-bg-hover/50 transition-colors rounded-r-sm group"
      >
        {/* Status icon */}
        {isRunning ? (
          <span className="w-3 h-3 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
        ) : result?.isError ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-error flex-shrink-0">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-success flex-shrink-0">
            <path d="M3 8.5l3.5 3.5L13 4" />
          </svg>
        )}

        {/* Tool name */}
        <span className="text-[11px] text-text-muted flex-shrink-0">{toolName}</span>

        {/* Summary */}
        <span className="text-[11px] text-text-secondary font-mono truncate">
          {summary}
        </span>

        {/* Expand hint on hover */}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
          className="flex-shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
        >
          <path d="M3 4l2 2 2-2" />
        </svg>
      </button>
    );
  }

  // --- Expanded: full details ---
  return (
    <div className="my-1 rounded-lg border border-border overflow-hidden bg-bg-secondary">
      {/* Header */}
      <button
        onClick={() => setExpanded(false)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-hover transition-colors"
      >
        {/* Status */}
        {isRunning ? (
          <span className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
        ) : result?.isError ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-error flex-shrink-0">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-success flex-shrink-0">
            <path d="M3 8.5l3.5 3.5L13 4" />
          </svg>
        )}

        <span className="font-medium text-text-primary">{toolName}</span>
        <span className="text-text-muted truncate flex-1 text-left font-mono">
          {summary}
        </span>

        {/* Collapse chevron */}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
          className="flex-shrink-0 text-text-muted rotate-180"
        >
          <path d="M3 4l2 2 2-2" />
        </svg>
      </button>

      {/* Details */}
      <div className="border-t border-border px-3 py-2 space-y-2">
        {/* Input */}
        {Object.keys(input).length > 0 && (
          <div>
            <div className="text-xs text-text-muted mb-1 font-semibold">
              Input
            </div>
            <SmartInput toolName={toolName} input={input} />
          </div>
        )}

        {/* Result */}
        {result && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <div
                className={`text-xs font-semibold ${
                  result.isError ? "text-error" : "text-text-muted"
                }`}
              >
                {result.isError ? "Error" : "Output"}
              </div>
              {result.content && <CopySmall text={result.content} />}
            </div>
            <pre
              className={`text-xs whitespace-pre-wrap break-all max-h-80 overflow-y-auto ${
                result.isError ? "text-error/80" : "text-text-secondary"
              }`}
            >
              {result.content || "(empty)"}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
