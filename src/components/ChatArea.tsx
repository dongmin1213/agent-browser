"use client";

import { useEffect, useRef, useMemo } from "react";
import type { UIMessage, ToolResultMessage } from "@/types/chat";
import MessageBubble from "./MessageBubble";

interface ChatAreaProps {
  messages: UIMessage[];
  isLoading: boolean;
}

export default function ChatArea({ messages, isLoading }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Build a map of toolUseId -> ToolResultMessage
  const toolResults = useMemo(() => {
    const map = new Map<string, ToolResultMessage>();
    for (const msg of messages) {
      if (msg.role === "tool_result") {
        map.set(msg.toolUseId, msg);
      }
    }
    return map;
  }, [messages]);

  // Empty state
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4 opacity-20">&#x2728;</div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Claude Agent Chat
          </h2>
          <p className="text-text-muted text-sm leading-relaxed">
            Claude Agent SDK powered chat. Ask anything - Claude can read files,
            run commands, search the web, and more.
          </p>
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
              <div className="flex items-center gap-1.5 px-4 py-2.5 bg-bg-secondary rounded-xl">
                <span className="typing-dot w-2 h-2 bg-text-muted rounded-full" />
                <span className="typing-dot w-2 h-2 bg-text-muted rounded-full" />
                <span className="typing-dot w-2 h-2 bg-text-muted rounded-full" />
              </div>
            </div>
          )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
