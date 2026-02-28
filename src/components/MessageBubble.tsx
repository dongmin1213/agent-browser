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
  messageIndex?: number;
  onBranch?: (messageIndex: number) => void;
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

function BranchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors py-1"
      title="Branch from here"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="4" cy="4" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="4" r="2" />
        <path d="M4 6v2c0 2 2 4 4 4h2" />
        <path d="M4 4h6" />
      </svg>
      Branch
    </button>
  );
}

// Detect image URLs in text
function renderContentWithImages(content: string) {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const parts: (string | { alt: string; src: string })[] = [];
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push({ alt: match[1], src: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

export default function MessageBubble({
  message,
  toolResults,
  messageIndex,
  onBranch,
}: MessageBubbleProps) {
  // ---- Plan approval (handled by ChatArea directly) ----
  if (message.role === "plan_approval") {
    return null;
  }

  // ---- User message ----
  if (message.role === "user") {
    const userImages = (message as { images?: string[] }).images;
    return (
      <div className="flex justify-end mb-4 group/msg">
        <div className="max-w-[80%] min-w-0">
          <div className="bg-accent-dim/30 border border-accent/20 rounded-2xl rounded-br-md px-4 py-2.5">
            {/* User-attached images */}
            {userImages && userImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {userImages.map((src, i) => {
                  // If src is a file path (not data URL), use API endpoint
                  const imgSrc = src.startsWith("data:") ? src : `/api/image?path=${encodeURIComponent(src)}`;
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={imgSrc}
                      alt={`attached image ${i + 1}`}
                      className="max-w-[200px] max-h-[200px] rounded-lg border border-accent/20 object-contain"
                      loading="lazy"
                    />
                  );
                })}
              </div>
            )}
            <p className="text-text-primary whitespace-pre-wrap text-sm leading-relaxed">
              {message.content}
            </p>
          </div>
          {/* Branch button on hover */}
          {onBranch && messageIndex !== undefined && (
            <div className="opacity-0 group-hover/msg:opacity-100 transition-opacity mt-1 flex justify-end">
              <BranchButton onClick={() => onBranch(messageIndex)} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Assistant text ----
  if (message.role === "assistant") {
    // Hide empty assistant messages (no content + not streaming)
    if (!message.content.trim() && !message.isStreaming) return null;
    return (
      <div className="flex justify-start mb-4 group/msg">
        <div className="max-w-[85%] min-w-0">
          <div className="markdown-content text-sm leading-relaxed overflow-hidden break-words [&_.code-block-wrapper]:overflow-x-auto [&_.code-block-wrapper]:break-normal">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const codeString = String(children).replace(/\n$/, "");
                  // Block: has language class OR content has newlines (fenced code block without lang)
                  const isBlock = !!match || !!className || codeString.includes("\n");
                  if (!isBlock) {
                    return (
                      <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[13px] text-accent/90">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <CodeBlock language={match ? match[1] : ""}>
                      {codeString}
                    </CodeBlock>
                  );
                },
                pre({ children }) {
                  return <>{children}</>;
                },
                img({ src, alt }) {
                  return (
                    <span className="block my-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={alt || "image"}
                        className="max-w-full rounded-lg border border-border"
                        loading="lazy"
                      />
                    </span>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
            {message.isStreaming && (
              <span className="inline-block w-2 h-[18px] bg-accent/80 rounded-sm animate-blink ml-0.5 align-middle" />
            )}
          </div>
          {/* Action buttons - appear on hover */}
          {!message.isStreaming && message.content && (
            <div className="opacity-0 group-hover/msg:opacity-100 transition-opacity mt-1 flex items-center gap-3">
              <CopyButton text={message.content} />
              {onBranch && messageIndex !== undefined && (
                <BranchButton onClick={() => onBranch(messageIndex)} />
              )}
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
