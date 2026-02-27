"use client";

import type { UIMessage, ToolResultMessage } from "@/types/chat";
import ToolBlock from "./ToolBlock";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageBubbleProps {
  message: UIMessage;
  toolResults: Map<string, ToolResultMessage>;
}

export default function MessageBubble({
  message,
  toolResults,
}: MessageBubbleProps) {
  // ---- User message ----
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] bg-accent-dim/30 border border-accent/20 rounded-2xl rounded-br-md px-4 py-2.5">
          <p className="text-text-primary whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  // ---- Assistant text ----
  if (message.role === "assistant") {
    return (
      <div className="flex justify-start mb-4">
        <div className="max-w-[85%]">
          <div className="markdown-content text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
            {message.isStreaming && (
              <span className="inline-flex gap-0.5 ml-1">
                <span className="typing-dot w-1.5 h-1.5 bg-accent rounded-full inline-block" />
                <span className="typing-dot w-1.5 h-1.5 bg-accent rounded-full inline-block" />
                <span className="typing-dot w-1.5 h-1.5 bg-accent rounded-full inline-block" />
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Tool use ----
  if (message.role === "tool_use") {
    const result = toolResults.get(message.toolUseId);
    return (
      <div className="mb-2 max-w-[85%]">
        <ToolBlock
          toolName={message.toolName}
          input={message.input}
          isRunning={message.isRunning}
          result={result ? { content: result.content, isError: result.isError } : null}
        />
      </div>
    );
  }

  // ---- Tool result (standalone, for cases without tool_use pairing) ----
  if (message.role === "tool_result") {
    // Usually paired with tool_use above, skip standalone rendering
    return null;
  }

  // ---- Error ----
  if (message.role === "error") {
    return (
      <div className="flex justify-start mb-4">
        <div className="max-w-[85%] bg-error/10 border border-error/30 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-error text-sm">&#x26A0;</span>
            <span className="text-error text-xs font-semibold">Error</span>
          </div>
          <p className="text-error/80 text-sm whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
