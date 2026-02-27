"use client";

import { useState } from "react";
import type { UIMessage, ToolResultMessage } from "@/types/chat";
import ToolBlock from "./ToolBlock";
import CodeBlock from "./CodeBlock";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageBubbleProps {
  message: UIMessage;
  toolResults: Map<string, ToolResultMessage>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors py-1"
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 8.5l3.5 3.5L13 4" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="5" y="5" width="8" height="8" rx="1" />
            <path d="M3 11V3a1 1 0 011-1h8" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
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
      <div className="flex justify-start mb-4 group/msg">
        <div className="max-w-[85%]">
          <div className="markdown-content text-sm leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const isBlock = !!match || !!className;
                  if (!isBlock) {
                    return (
                      <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[13px] text-accent/90">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <CodeBlock language={match ? match[1] : ""}>
                      {String(children).replace(/\n$/, "")}
                    </CodeBlock>
                  );
                },
                pre({ children }) {
                  return <>{children}</>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
            {message.isStreaming && (
              <span className="inline-block w-2 h-[18px] bg-accent/80 rounded-sm animate-blink ml-0.5 align-middle" />
            )}
          </div>
          {/* Copy button - appears on hover */}
          {!message.isStreaming && message.content && (
            <div className="opacity-0 group-hover/msg:opacity-100 transition-opacity mt-1">
              <CopyButton text={message.content} />
            </div>
          )}
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

  // ---- Tool result (standalone) ----
  if (message.role === "tool_result") {
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
