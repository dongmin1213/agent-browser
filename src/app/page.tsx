"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  Chat,
  UIMessage,
  StreamEvent,
  AssistantTextMessage,
  ToolUseMessage,
  ToolResultMessage,
  ErrorMessage,
} from "@/types/chat";
import {
  loadChats,
  saveChats,
  createChat,
  deleteChat as deleteChatFromList,
  addMessageToChat,
  updateMessageInChat,
  updateMessageByToolUseId,
  setChatSessionId,
  updateChatTitle,
  updateChatSettings,
  generateTitle,
} from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import MessageInput from "@/components/MessageInput";
import TopBar from "@/components/TopBar";
import ExplorerPanel from "@/components/ExplorerPanel";
import PreviewPanel from "@/components/PreviewPanel";

// =========================================
// NDJSON Stream Reader
// =========================================

async function readNDJSONStream(
  response: Response,
  onEvent: (event: StreamEvent) => void
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line) as StreamEvent;
          onEvent(event);
        } catch {
          // Skip malformed lines
        }
      }
    }
  }

  // Remaining buffer
  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer) as StreamEvent;
      onEvent(event);
    } catch {
      // Skip
    }
  }
}

// =========================================
// Main Page Component
// =========================================

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [attachments, setAttachments] = useState<{ name: string; content: string }[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [defaultCwd, setDefaultCwd] = useState("");
  const [rightPanel, setRightPanel] = useState<"explorer" | "preview" | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(50); // percentage
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize default CWD
  useEffect(() => {
    if (!defaultCwd) {
      fetch("/api/files").then(r => r.json()).then(d => { if (d.cwd) setDefaultCwd(d.cwd); });
    }
  }, [defaultCwd]);

  // Drag resizer for right panel
  const handleMouseDown = useCallback(() => {
    isDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = ((rect.width - x) / rect.width) * 100;
      setRightPanelWidth(Math.min(80, Math.max(20, pct)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // Refs for stream event handler (avoid stale closures)
  const activeChatIdRef = useRef<string | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const currentToolUseIdRef = useRef<string | null>(null);
  const toolInputBufferRef = useRef<Record<string, string>>({});
  const toolUseMessageIdMapRef = useRef<Map<string, string>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync ref
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Load chats from localStorage on mount
  useEffect(() => {
    const loaded = loadChats();
    setChats(loaded);
    if (loaded.length > 0) {
      setActiveChatId(loaded[0].id);
    }
  }, []);

  // Save to localStorage when chats change
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  useEffect(() => {
    if (chats.length > 0) {
      saveChats(chats);
    }
  }, [chats]);

  // Get active chat + derived model/cwd
  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const model = activeChat?.model || "opus";
  const cwd = activeChat?.cwd || defaultCwd;

  const handleModelChange = useCallback((newModel: string) => {
    if (!activeChatId) return;
    setChats((prev) => updateChatSettings(prev, activeChatId, { model: newModel }));
  }, [activeChatId]);

  const handleCwdChange = useCallback((newCwd: string) => {
    if (!activeChatId) return;
    setChats((prev) => updateChatSettings(prev, activeChatId, { cwd: newCwd }));
  }, [activeChatId]);

  // =========================================
  // Chat Actions
  // =========================================

  const handleNewChat = useCallback(() => {
    const newChat = createChat("opus", defaultCwd);
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setInputValue("");
  }, [defaultCwd]);

  const handleDeleteChat = useCallback(
    (chatId: string) => {
      setChats((prev) => deleteChatFromList(prev, chatId));
      if (activeChatId === chatId) {
        setChats((prev) => {
          const remaining = prev.filter((c) => c.id !== chatId);
          setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
          return prev;
        });
      }
    },
    [activeChatId]
  );

  const handleSelectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setInputValue("");
  }, []);

  // =========================================
  // Stream Event Handler
  // =========================================

  const handleStreamEvent = useCallback((event: StreamEvent) => {
    const chatId = activeChatIdRef.current;
    if (!chatId) return;

    switch (event.type) {
      case "session_init":
        setChats((prev) => setChatSessionId(prev, chatId, event.sessionId));
        break;

      case "text_delta": {
        if (!currentAssistantIdRef.current) {
          // Create new assistant message
          const newMsg: AssistantTextMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: event.text,
            timestamp: Date.now(),
            isStreaming: true,
          };
          currentAssistantIdRef.current = newMsg.id;
          setChats((prev) => addMessageToChat(prev, chatId, newMsg));
        } else {
          // Append to existing
          const msgId = currentAssistantIdRef.current;
          setChats((prev) =>
            updateMessageInChat(prev, chatId, msgId, (msg) => ({
              ...msg,
              content:
                (msg as AssistantTextMessage).content + event.text,
            }))
          );
        }
        break;
      }

      case "text_done": {
        if (currentAssistantIdRef.current) {
          const msgId = currentAssistantIdRef.current;
          setChats((prev) =>
            updateMessageInChat(prev, chatId, msgId, (msg) => ({
              ...msg,
              isStreaming: false,
            }))
          );
          currentAssistantIdRef.current = null;
        }
        break;
      }

      case "tool_use_start": {
        // Close any open assistant text
        if (currentAssistantIdRef.current) {
          const msgId = currentAssistantIdRef.current;
          setChats((prev) =>
            updateMessageInChat(prev, chatId, msgId, (msg) => ({
              ...msg,
              isStreaming: false,
            }))
          );
          currentAssistantIdRef.current = null;
        }

        const toolMsg: ToolUseMessage = {
          id: crypto.randomUUID(),
          role: "tool_use",
          toolName: event.toolName,
          toolUseId: event.toolUseId,
          input: {},
          timestamp: Date.now(),
          isRunning: true,
        };
        currentToolUseIdRef.current = event.toolUseId;
        toolInputBufferRef.current[event.toolUseId] = "";
        toolUseMessageIdMapRef.current.set(event.toolUseId, toolMsg.id);
        setChats((prev) => addMessageToChat(prev, chatId, toolMsg));
        break;
      }

      case "tool_use_input_delta": {
        const tid = currentToolUseIdRef.current;
        if (tid) {
          toolInputBufferRef.current[tid] =
            (toolInputBufferRef.current[tid] || "") + event.partialJson;
          try {
            const parsed = JSON.parse(toolInputBufferRef.current[tid]);
            const msgId = toolUseMessageIdMapRef.current.get(tid);
            if (msgId) {
              setChats((prev) =>
                updateMessageInChat(prev, chatId, msgId, (msg) => ({
                  ...msg,
                  input: parsed,
                }))
              );
            }
          } catch {
            // JSON not yet complete
          }
        }
        break;
      }

      case "tool_use_done": {
        setChats((prev) =>
          updateMessageByToolUseId(prev, chatId, event.toolUseId, (msg) => ({
            ...msg,
            input: event.input || (msg as ToolUseMessage).input,
            isRunning: false,
          }))
        );
        currentToolUseIdRef.current = null;
        break;
      }

      case "tool_result": {
        const resultMsg: ToolResultMessage = {
          id: crypto.randomUUID(),
          role: "tool_result",
          toolUseId: event.toolUseId,
          content: event.content,
          isError: event.isError,
          timestamp: Date.now(),
        };
        setChats((prev) => addMessageToChat(prev, chatId, resultMsg));

        // Mark tool as done
        setChats((prev) =>
          updateMessageByToolUseId(prev, chatId, event.toolUseId, (msg) => ({
            ...msg,
            isRunning: false,
          }))
        );
        break;
      }

      case "turn_done": {
        // Reset text tracking for next turn
        currentAssistantIdRef.current = null;
        break;
      }

      case "result": {
        // Update chat title from first user message
        setChats((prev) => {
          const chat = prev.find((c) => c.id === chatId);
          if (chat && chat.title === "New Chat") {
            const firstUserMsg = chat.messages.find(
              (m) => m.role === "user"
            );
            if (firstUserMsg && "content" in firstUserMsg) {
              return updateChatTitle(
                prev,
                chatId,
                generateTitle(firstUserMsg.content as string)
              );
            }
          }
          return prev;
        });
        setIsLoading(false);
        break;
      }

      case "error": {
        const errMsg: ErrorMessage = {
          id: crypto.randomUUID(),
          role: "error",
          content: event.message,
          timestamp: Date.now(),
        };
        setChats((prev) => addMessageToChat(prev, chatId, errMsg));
        setIsLoading(false);
        break;
      }
    }
  }, []);

  // =========================================
  // Send Message
  // =========================================

  const handleSend = useCallback(async () => {
    const message = inputValue.trim();
    if (!message && attachments.length === 0) return;
    if (isLoading) return;

    // Build full prompt with attachments
    let fullMessage = message;
    if (attachments.length > 0) {
      const attachmentText = attachments
        .map((a) => `<file name="${a.name}">\n${a.content}\n</file>`)
        .join("\n\n");
      fullMessage = attachmentText + (message ? "\n\n" + message : "");
    }

    // Ensure we have a chat
    let chatId = activeChatIdRef.current;
    if (!chatId) {
      const newChat = createChat("opus", defaultCwd);
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      chatId = newChat.id;
      activeChatIdRef.current = chatId;
    }

    // Add user message (show original text, not the full prompt with attachments)
    const displayText = attachments.length > 0
      ? (message || "") + (attachments.length > 0 ? `\n\n📎 ${attachments.map(a => a.name).join(", ")}` : "")
      : message;
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayText,
      timestamp: Date.now(),
    };
    setChats((prev) => addMessageToChat(prev, chatId!, userMsg));
    setInputValue("");
    setAttachments([]);
    setIsLoading(true);

    // Reset tracking refs
    currentAssistantIdRef.current = null;
    currentToolUseIdRef.current = null;
    toolInputBufferRef.current = {};
    toolUseMessageIdMapRef.current.clear();

    // Get session ID for resume
    const chat = chatsRef.current.find((c) => c.id === chatId);
    const sessionId = chat?.sessionId || undefined;

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: fullMessage, sessionId, model, cwd: cwd || undefined }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await readNDJSONStream(response, handleStreamEvent);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // User stopped
        setIsLoading(false);
        return;
      }
      const errMsg: ErrorMessage = {
        id: crypto.randomUUID(),
        role: "error",
        content:
          err instanceof Error ? err.message : "Failed to connect to agent",
        timestamp: Date.now(),
      };
      setChats((prev) => addMessageToChat(prev, chatId!, errMsg));
      setIsLoading(false);
    } finally {
      abortControllerRef.current = null;
    }
  }, [inputValue, isLoading, handleStreamEvent]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  // =========================================
  // Render
  // =========================================

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <TopBar
          model={model}
          onModelChange={handleModelChange}
          cwd={cwd}
          onCwdChange={handleCwdChange}
          activeTab={rightPanel}
          onTabChange={setRightPanel}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {/* Content area with optional right panel */}
        <div className="flex-1 flex min-h-0" ref={containerRef}>
          {/* Chat column */}
          <div className="flex flex-col min-w-0" style={{ width: rightPanel ? `${100 - rightPanelWidth}%` : "100%" }}>
            <ChatArea
              messages={activeChat?.messages || []}
              isLoading={isLoading}
            />
            <MessageInput
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSend}
              onStop={handleStop}
              isLoading={isLoading}
              attachments={attachments}
              onAttach={(files) => setAttachments((prev) => [...prev, ...files])}
              onRemoveAttachment={(i) => setAttachments((prev) => prev.filter((_, j) => j !== i))}
            />
          </div>

          {/* Drag handle */}
          {rightPanel && (
            <div
              onMouseDown={handleMouseDown}
              className="w-1 hover:w-1 bg-border hover:bg-accent/50 cursor-col-resize transition-colors flex-shrink-0 hidden md:block"
            />
          )}

          {/* Right panel */}
          {rightPanel && (
            <div
              className="border-l border-border bg-bg-secondary flex-shrink-0 hidden md:flex flex-col min-w-0"
              style={{ width: `${rightPanelWidth}%` }}
            >
              {rightPanel === "explorer" && <ExplorerPanel cwd={cwd} />}
              {rightPanel === "preview" && <PreviewPanel cwd={cwd} />}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
