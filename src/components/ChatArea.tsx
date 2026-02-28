"use client";

import { useEffect, useRef, useMemo, useState, memo } from "react";
import type { UIMessage, ToolResultMessage, ToolUseMessage, PlanApprovalMessage, AskUserMessage } from "@/types/chat";
import MessageBubble from "./MessageBubble";
import ToolBlock from "./ToolBlock";
import PlanApprovalBlock from "./PlanApprovalBlock";
import AskUserBlock from "./AskUserBlock";

const SUGGESTED_PROMPTS = [
  { icon: "\uD83D\uDCDD", label: "Explain this codebase", prompt: "Read the project structure and give me a high-level overview of this codebase." },
  { icon: "\uD83D\uDC1B", label: "Find and fix bugs", prompt: "Search for potential bugs or issues in the codebase and suggest fixes." },
  { icon: "\uD83D\uDD27", label: "Refactor code", prompt: "Identify areas that could benefit from refactoring and implement improvements." },
  { icon: "\uD83D\uDCD6", label: "Write documentation", prompt: "Generate comprehensive documentation for the key modules in this project." },
];

interface ChatAreaProps {
  messages: UIMessage[];
  isLoading: boolean;
  onSendPrompt?: (prompt: string) => void;
  onBranchChat?: (messageIndex: number) => void;
  onPlanApproval?: (approved: boolean, feedback?: string) => void;
  onAskUserAnswer?: (answers: Record<string, string>) => void;
  onTogglePin?: (messageId: string) => void;
  chatCost?: number;
  chatDuration?: number;
}

// =========================================
// PinnedStrip: collapsible section showing pinned messages
// =========================================

function PinnedStrip({
  pinnedMessages,
  onTogglePin,
}: {
  pinnedMessages: UIMessage[];
  onTogglePin?: (messageId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4 border border-accent/20 rounded-xl bg-accent-dim/10 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent-dim/20 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" strokeWidth="0.5" className="text-accent flex-shrink-0">
          <path d="M9.5 2L14 6.5l-3 1-2.5 3L7 12l-1-2-3.5-1 3-2.5 1-3z" />
          <path d="M5 11L2 14" fill="none" strokeWidth="1.5" />
        </svg>
        <span className="text-xs font-medium text-accent">
          {pinnedMessages.length} pinned message{pinnedMessages.length !== 1 ? "s" : ""}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`ml-auto text-accent transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M3 4l2 2 2-2" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-accent/10 px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
          {pinnedMessages.map((msg) => {
            const content = (msg as { content?: string }).content || "";
            const preview = content.length > 120 ? content.slice(0, 120) + "..." : content;
            return (
              <div key={msg.id} className="flex items-start gap-2 group/pin">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${
                  msg.role === "user"
                    ? "bg-accent-dim/30 text-accent"
                    : "bg-bg-tertiary text-text-secondary"
                }`}>
                  {msg.role === "user" ? "You" : "AI"}
                </span>
                <p className="text-xs text-text-secondary flex-1 min-w-0 leading-relaxed line-clamp-2">
                  {preview}
                </p>
                {onTogglePin && (
                  <button
                    onClick={() => onTogglePin(msg.id)}
                    className="opacity-0 group-hover/pin:opacity-100 text-text-muted hover:text-error text-[10px] flex-shrink-0 mt-0.5 transition-opacity"
                    title="Unpin"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =========================================
// ToolGroup: collapsible group of consecutive tool messages
// =========================================

interface ToolGroupProps {
  toolMessages: UIMessage[];
  toolResults: Map<string, ToolResultMessage>;
  hasRunningTool: boolean;
}

function ToolGroup({ toolMessages, toolResults, hasRunningTool }: ToolGroupProps) {
  // Auto-expand if a tool is currently running
  const [expanded, setExpanded] = useState(false);

  // Count tool_use messages (not tool_result)
  const toolUses = toolMessages.filter((m) => m.role === "tool_use") as ToolUseMessage[];
  const toolCount = toolUses.length;
  const hasError = toolUses.some((t) => {
    const result = toolResults.get(t.toolUseId);
    return result?.isError;
  });

  // Generate summary of tool names
  const toolNameCounts = new Map<string, number>();
  for (const t of toolUses) {
    toolNameCounts.set(t.toolName, (toolNameCounts.get(t.toolName) || 0) + 1);
  }
  const summaryParts: string[] = [];
  for (const [name, count] of toolNameCounts) {
    summaryParts.push(count > 1 ? `${name} ×${count}` : name);
  }
  const summary = summaryParts.join(", ");

  // If only 1 tool use, don't show group wrapper — just render inline
  if (toolCount <= 1) {
    return (
      <>
        {toolMessages.map((msg) => {
          if (msg.role === "tool_use") {
            const toolMsg = msg as ToolUseMessage;
            const result = toolResults.get(toolMsg.toolUseId);
            return (
              <div key={msg.id} className="mb-1">
                <ToolBlock
                  toolName={toolMsg.toolName}
                  input={toolMsg.input}
                  isRunning={toolMsg.isRunning}
                  result={result ? { content: result.content, isError: result.isError } : null}
                />
              </div>
            );
          }
          // Skip tool_result (already merged into ToolBlock via toolResults map)
          return null;
        })}
      </>
    );
  }

  // Show running tools always expanded
  const isExpanded = expanded || hasRunningTool;

  return (
    <div className="my-2">
      {/* Group header - collapsible toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 py-1 px-2 w-full text-left border-l-2 border-accent/30 hover:border-accent/60 hover:bg-bg-hover/50 transition-colors rounded-r-sm group"
      >
        {/* Status icon */}
        {hasRunningTool ? (
          <span className="w-3 h-3 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
        ) : hasError ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-error flex-shrink-0">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-success flex-shrink-0">
            <path d="M3 8.5l3.5 3.5L13 4" />
          </svg>
        )}

        <span className="text-[11px] text-text-muted">
          {toolCount} tool uses
        </span>
        <span className="text-[11px] text-text-secondary font-mono truncate">
          {summary}
        </span>

        {/* Expand/collapse chevron */}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`flex-shrink-0 text-text-muted ml-auto transition-transform ${isExpanded ? "rotate-180" : ""}`}
        >
          <path d="M3 4l2 2 2-2" />
        </svg>
      </button>

      {/* Expanded: show individual tool blocks */}
      {isExpanded && (
        <div className="ml-3 mt-1 space-y-0.5">
          {toolMessages.map((msg) => {
            if (msg.role === "tool_use") {
              const toolMsg = msg as ToolUseMessage;
              const result = toolResults.get(toolMsg.toolUseId);
              return (
                <ToolBlock
                  key={msg.id}
                  toolName={toolMsg.toolName}
                  input={toolMsg.input}
                  isRunning={toolMsg.isRunning}
                  result={result ? { content: result.content, isError: result.isError } : null}
                />
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

// =========================================
// Group messages into segments: text messages vs tool groups
// =========================================

type MessageSegment =
  | { type: "message"; msg: UIMessage; index: number }
  | { type: "toolgroup"; messages: UIMessage[]; startIndex: number };

function groupMessages(messages: UIMessage[]): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let currentToolGroup: UIMessage[] | null = null;
  let toolGroupStart = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "tool_use" || msg.role === "tool_result") {
      if (!currentToolGroup) {
        currentToolGroup = [];
        toolGroupStart = i;
      }
      currentToolGroup.push(msg);
    } else {
      // Flush current tool group
      if (currentToolGroup) {
        segments.push({ type: "toolgroup", messages: currentToolGroup, startIndex: toolGroupStart });
        currentToolGroup = null;
      }
      segments.push({ type: "message", msg, index: i });
    }
  }
  // Flush remaining tool group
  if (currentToolGroup) {
    segments.push({ type: "toolgroup", messages: currentToolGroup, startIndex: toolGroupStart });
  }

  return segments;
}

// =========================================
// ChatArea
// =========================================

export default memo(function ChatArea({ messages, isLoading, onSendPrompt, onBranchChat, onPlanApproval, onAskUserAnswer, onTogglePin, chatCost, chatDuration }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toolResults = useMemo(() => {
    const map = new Map<string, ToolResultMessage>();
    for (const msg of messages) {
      if (msg.role === "tool_result") {
        map.set(msg.toolUseId, msg);
      }
    }
    return map;
  }, [messages]);

  const segments = useMemo(() => groupMessages(messages), [messages]);

  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.pinned && (m.role === "user" || m.role === "assistant")),
    [messages]
  );

  // Empty state with suggested prompts
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-lg">
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            Claude Agent Chat
          </h2>
          <p className="text-text-muted text-sm mb-6">
            What would you like to work on?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTED_PROMPTS.map((item) => (
              <button
                key={item.label}
                onClick={() => onSendPrompt?.(item.prompt)}
                className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-bg-secondary hover:bg-bg-hover hover:border-accent/30 transition-colors text-left group"
              >
                <span className="text-base mt-0.5">{item.icon}</span>
                <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {/* Pinned messages strip */}
        {pinnedMessages.length > 0 && (
          <PinnedStrip
            pinnedMessages={pinnedMessages}
            onTogglePin={onTogglePin}
          />
        )}
        {segments.map((segment, i) => {
          if (segment.type === "message") {
            // Render PlanApprovalBlock for plan_approval messages
            if (segment.msg.role === "plan_approval") {
              const planMsg = segment.msg as PlanApprovalMessage;
              return (
                <PlanApprovalBlock
                  key={segment.msg.id}
                  status={planMsg.status}
                  feedback={planMsg.feedback}
                  allowedPrompts={planMsg.allowedPrompts}
                  planContent={planMsg.planContent}
                  onApprove={(feedback) => onPlanApproval?.(true, feedback)}
                  onReject={(feedback) => onPlanApproval?.(false, feedback)}
                />
              );
            }
            // Render AskUserBlock for ask_user messages
            if (segment.msg.role === "ask_user") {
              const askMsg = segment.msg as AskUserMessage;
              return (
                <AskUserBlock
                  key={segment.msg.id}
                  questions={askMsg.questions}
                  status={askMsg.status}
                  answers={askMsg.answers}
                  onAnswer={(answers) => onAskUserAnswer?.(answers)}
                />
              );
            }
            return (
              <MessageBubble
                key={segment.msg.id}
                message={segment.msg}
                toolResults={toolResults}
                messageIndex={segment.index}
                onBranch={onBranchChat}
                onTogglePin={onTogglePin}
              />
            );
          }
          // Tool group
          const hasRunningTool = segment.messages.some(
            (m) => m.role === "tool_use" && (m as ToolUseMessage).isRunning
          );
          return (
            <ToolGroup
              key={`toolgroup-${i}`}
              toolMessages={segment.messages}
              toolResults={toolResults}
              hasRunningTool={hasRunningTool}
            />
          );
        })}

        {/* Contextual activity indicator */}
        {isLoading && messages.length > 0 && (() => {
          const last = messages[messages.length - 1];
          const isStreaming = last.role === "assistant" && (last as { isStreaming?: boolean }).isStreaming;
          const isToolRunning = last.role === "tool_use" && (last as { isRunning?: boolean }).isRunning;
          if (isStreaming || isToolRunning) return null;

          return (
            <div className="flex items-center gap-2 mb-4 px-1 py-2">
              <span className="w-3 h-3 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="text-xs text-text-muted">Thinking...</span>
            </div>
          );
        })()}

        {/* Cost display at bottom */}
        {chatCost !== undefined && chatCost > 0 && (
          <div className="flex justify-center py-2">
            <div className="text-[10px] text-text-muted bg-bg-secondary rounded-full px-3 py-1 flex items-center gap-2">
              <span>${chatCost.toFixed(4)}</span>
              {chatDuration !== undefined && chatDuration > 0 && (
                <>
                  <span>&middot;</span>
                  <span>{(chatDuration / 1000).toFixed(1)}s</span>
                </>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
});
