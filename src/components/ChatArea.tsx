"use client";

import { useEffect, useRef, useMemo } from "react";
import type { UIMessage, ToolResultMessage } from "@/types/chat";
import MessageBubble from "./MessageBubble";

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
}

export default function ChatArea({ messages, isLoading, onSendPrompt }: ChatAreaProps) {
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
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            toolResults={toolResults}
          />
        ))}

        {/* Loading indicator when waiting for first response */}
        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1].role === "user" && (
            <div className="flex justify-start mb-4">
              <div className="flex items-center gap-1.5 px-4 py-2.5">
                <span className="inline-block w-2 h-[18px] bg-accent/80 rounded-sm animate-blink" />
              </div>
            </div>
          )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
