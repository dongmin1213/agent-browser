"use client";

import { useState } from "react";

interface ToolBlockProps {
  toolName: string;
  input: Record<string, unknown>;
  isRunning: boolean;
  result?: { content: string; isError: boolean } | null;
}

const TOOL_ICONS: Record<string, string> = {
  Bash: "\u2318",
  Read: "\uD83D\uDCC4",
  Write: "\u270F\uFE0F",
  Edit: "\u2702\uFE0F",
  Glob: "\uD83D\uDD0D",
  Grep: "\uD83D\uDD0E",
  WebSearch: "\uD83C\uDF10",
  WebFetch: "\u2B07\uFE0F",
};

function getToolSummary(
  toolName: string,
  input: Record<string, unknown>
): string {
  switch (toolName) {
    case "Bash":
      return (input.command as string) || "Running command...";
    case "Read":
      return (input.file_path as string) || "Reading file...";
    case "Write":
      return (input.file_path as string) || "Writing file...";
    case "Edit":
      return (input.file_path as string) || "Editing file...";
    case "Glob":
      return (input.pattern as string) || "Searching files...";
    case "Grep":
      return (input.pattern as string) || "Searching content...";
    case "WebSearch":
      return (input.query as string) || "Searching web...";
    case "WebFetch":
      return (input.url as string) || "Fetching URL...";
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
  const icon = TOOL_ICONS[toolName] || "\u2699\uFE0F";
  const summary = getToolSummary(toolName, input);

  return (
    <div className="my-2 rounded-lg border border-border overflow-hidden bg-bg-secondary">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-hover transition-colors"
      >
        {/* Status */}
        {isRunning ? (
          <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
        ) : result?.isError ? (
          <span className="text-error flex-shrink-0">&#x2717;</span>
        ) : (
          <span className="text-success flex-shrink-0">&#x2713;</span>
        )}

        {/* Icon + Name */}
        <span className="flex-shrink-0">{icon}</span>
        <span className="font-medium text-text-primary">{toolName}</span>

        {/* Summary */}
        <span className="text-text-muted truncate flex-1 text-left font-mono text-xs">
          {summary}
        </span>

        {/* Chevron */}
        <span
          className={`text-text-muted transition-transform flex-shrink-0 ${
            expanded ? "rotate-180" : ""
          }`}
        >
          &#x25BC;
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
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
      )}
    </div>
  );
}
