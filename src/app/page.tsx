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
  AppSettings,
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
  updateChatCost,
  branchChat,
  exportChatAsMarkdown,
  exportChatAsJSON,
  generateTitle,
  loadAppSettings,
  saveAppSettings,
} from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import MessageInput from "@/components/MessageInput";
import TopBar from "@/components/TopBar";
import ExplorerPanel from "@/components/ExplorerPanel";
import PreviewPanel from "@/components/PreviewPanel";
import SettingsModal from "@/components/SettingsModal";

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
// Download helper
// =========================================

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// =========================================
// Main Page Component
// =========================================

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingChatIds, setLoadingChatIds] = useState<Set<string>>(new Set());
  const [inputValue, setInputValue] = useState("");
  const [attachments, setAttachments] = useState<{ name: string; content: string }[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [defaultCwd, setDefaultCwd] = useState("");
  const [rightPanel, setRightPanel] = useState<"explorer" | "preview" | null>("explorer");
  const [rightPanelWidth, setRightPanelWidth] = useState(50);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // App settings
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", appSettings.theme);
  }, [appSettings.theme]);

  // Save app settings
  const handleAppSettingsChange = useCallback((settings: AppSettings) => {
    setAppSettings(settings);
    saveAppSettings(settings);
  }, []);

  // Initialize default CWD
  useEffect(() => {
    if (!defaultCwd) {
      fetch("/api/files").then(r => r.json()).then(d => { if (d.cwd) setDefaultCwd(d.cwd); });
    }
  }, [defaultCwd]);

  // =========================================
  // Keyboard Shortcuts
  // =========================================
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+N: New chat
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        handleNewChat();
      }
      // Ctrl+K: Focus search (sidebar auto-opens)
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (sidebarCollapsed) setSidebarCollapsed(false);
        setSidebarOpen(true);
        // Focus search input after render
        setTimeout(() => {
          const input = document.querySelector('aside input[placeholder*="Search"]') as HTMLInputElement;
          input?.focus();
        }, 100);
      }
      // Ctrl+,: Settings
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((p) => !p);
      }
      // Ctrl+E: Toggle explorer
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        setRightPanel((p) => p === "explorer" ? null : "explorer");
      }
      // Ctrl+Shift+E: Export current chat as markdown
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "E") {
        e.preventDefault();
        if (activeChatId) handleExportChat(activeChatId, "md");
      }
      // Escape: Close settings modal
      if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarCollapsed, settingsOpen, activeChatId]);

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

  // Per-chat stream state and abort controllers
  const streamStateRef = useRef<Map<string, {
    assistantId: string | null;
    toolUseId: string | null;
    toolInputBuffer: Record<string, string>;
    toolUseMessageIdMap: Map<string, string>;
  }>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const activeChatIdRef = useRef<string | null>(null);

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
    const newChat = createChat("opus", defaultCwd, appSettings);
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setInputValue("");
  }, [defaultCwd, appSettings]);

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

  const handleExportChat = useCallback((chatId: string, format: "md" | "json") => {
    const chat = chatsRef.current.find((c) => c.id === chatId);
    if (!chat) return;
    const safeName = chat.title.replace(/[^a-zA-Z0-9가-힣\s-_]/g, "").trim() || "chat";
    if (format === "md") {
      downloadFile(exportChatAsMarkdown(chat), `${safeName}.md`, "text/markdown");
    } else {
      downloadFile(exportChatAsJSON(chat), `${safeName}.json`, "application/json");
    }
  }, []);

  const handleBranchChat = useCallback((messageIndex: number) => {
    if (!activeChatId) return;
    const result = branchChat(chatsRef.current, activeChatId, messageIndex);
    if (result) {
      setChats(result.chats);
      setActiveChatId(result.newChatId);
    }
  }, [activeChatId]);

  const handleChatSettingsChange = useCallback((settings: Chat["settings"]) => {
    if (!activeChatId) return;
    setChats((prev) => updateChatSettings(prev, activeChatId, { settings }));
  }, [activeChatId]);

  // =========================================
  // Stream Event Handler (per-chat, chatId captured in closure)
  // =========================================

  const createStreamHandler = useCallback((chatId: string) => {
    // Initialize per-chat stream state
    streamStateRef.current.set(chatId, {
      assistantId: null,
      toolUseId: null,
      toolInputBuffer: {},
      toolUseMessageIdMap: new Map(),
    });

    return (event: StreamEvent) => {
      const state = streamStateRef.current.get(chatId);
      if (!state) return;

      switch (event.type) {
        case "session_init":
          setChats((prev) => setChatSessionId(prev, chatId, event.sessionId));
          break;

        case "text_delta": {
          if (!state.assistantId) {
            const newMsg: AssistantTextMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: event.text,
              timestamp: Date.now(),
              isStreaming: true,
            };
            state.assistantId = newMsg.id;
            setChats((prev) => addMessageToChat(prev, chatId, newMsg));
          } else {
            const msgId = state.assistantId;
            setChats((prev) =>
              updateMessageInChat(prev, chatId, msgId, (msg) => ({
                ...msg,
                content: (msg as AssistantTextMessage).content + event.text,
              }))
            );
          }
          break;
        }

        case "text_done": {
          if (state.assistantId) {
            const msgId = state.assistantId;
            setChats((prev) =>
              updateMessageInChat(prev, chatId, msgId, (msg) => ({
                ...msg,
                isStreaming: false,
              }))
            );
            state.assistantId = null;
          }
          break;
        }

        case "tool_use_start": {
          if (state.assistantId) {
            const msgId = state.assistantId;
            setChats((prev) =>
              updateMessageInChat(prev, chatId, msgId, (msg) => ({
                ...msg,
                isStreaming: false,
              }))
            );
            state.assistantId = null;
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
          state.toolUseId = event.toolUseId;
          state.toolInputBuffer[event.toolUseId] = "";
          state.toolUseMessageIdMap.set(event.toolUseId, toolMsg.id);
          setChats((prev) => addMessageToChat(prev, chatId, toolMsg));
          break;
        }

        case "tool_use_input_delta": {
          const tid = state.toolUseId;
          if (tid) {
            state.toolInputBuffer[tid] = (state.toolInputBuffer[tid] || "") + event.partialJson;
            try {
              const parsed = JSON.parse(state.toolInputBuffer[tid]);
              const msgId = state.toolUseMessageIdMap.get(tid);
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
          state.toolUseId = null;
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
          setChats((prev) =>
            updateMessageByToolUseId(prev, chatId, event.toolUseId, (msg) => ({
              ...msg,
              isRunning: false,
            }))
          );
          break;
        }

        case "turn_done": {
          state.assistantId = null;
          break;
        }

        case "result": {
          setChats((prev) => {
            const chat = prev.find((c) => c.id === chatId);
            if (chat && chat.title === "New Chat") {
              const firstUserMsg = chat.messages.find((m) => m.role === "user");
              if (firstUserMsg && "content" in firstUserMsg) {
                return updateChatTitle(prev, chatId, generateTitle(firstUserMsg.content as string));
              }
            }
            return prev;
          });
          if (event.costUsd || event.durationMs) {
            setChats((prev) => updateChatCost(prev, chatId, event.costUsd || 0, event.durationMs || 0));
          }
          setLoadingChatIds((prev) => { const next = new Set(prev); next.delete(chatId); return next; });
          streamStateRef.current.delete(chatId);
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
          setLoadingChatIds((prev) => { const next = new Set(prev); next.delete(chatId); return next; });
          streamStateRef.current.delete(chatId);
          break;
        }
      }
    };
  }, []);

  // =========================================
  // Send Message
  // =========================================

  const doSend = useCallback(async (fullMessage: string, displayText: string) => {
    if (isLoading) return;

    let chatId = activeChatIdRef.current;
    if (!chatId) {
      const newChat = createChat("opus", defaultCwd, appSettings);
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      chatId = newChat.id;
      activeChatIdRef.current = chatId;
    }

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayText,
      timestamp: Date.now(),
    };
    setChats((prev) => addMessageToChat(prev, chatId!, userMsg));
    setIsLoading(true);

    currentAssistantIdRef.current = null;
    currentToolUseIdRef.current = null;
    toolInputBufferRef.current = {};
    toolUseMessageIdMapRef.current.clear();

    const chat = chatsRef.current.find((c) => c.id === chatId);
    const sessionId = chat?.sessionId || undefined;
    const chatSettings = chat?.settings;

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fullMessage,
          sessionId,
          model,
          cwd: cwd || undefined,
          systemPrompt: chatSettings?.systemPrompt || appSettings.defaultSystemPrompt || undefined,
          maxTurns: chatSettings?.maxTurns || appSettings.defaultMaxTurns || undefined,
          maxBudgetUsd: chatSettings?.maxBudgetUsd || appSettings.defaultMaxBudgetUsd || undefined,
          mcpServers: appSettings.mcpServers.length > 0 ? appSettings.mcpServers : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await readNDJSONStream(response, handleStreamEvent);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setIsLoading(false);
        return;
      }
      const errMsg: ErrorMessage = {
        id: crypto.randomUUID(),
        role: "error",
        content: err instanceof Error ? err.message : "Failed to connect to agent",
        timestamp: Date.now(),
      };
      setChats((prev) => addMessageToChat(prev, chatId!, errMsg));
      setIsLoading(false);
    } finally {
      abortControllerRef.current = null;
    }
  }, [isLoading, handleStreamEvent, model, cwd, defaultCwd, appSettings]);

  const handleSend = useCallback(async () => {
    const message = inputValue.trim();
    if (!message && attachments.length === 0) return;

    let fullMessage = message;
    if (attachments.length > 0) {
      const attachmentText = attachments
        .map((a) => `<file name="${a.name}">\n${a.content}\n</file>`)
        .join("\n\n");
      fullMessage = attachmentText + (message ? "\n\n" + message : "");
    }

    const displayText = attachments.length > 0
      ? (message || "") + `\n\n\uD83D\uDCCE ${attachments.map(a => a.name).join(", ")}`
      : message;

    setInputValue("");
    setAttachments([]);
    await doSend(fullMessage, displayText);
  }, [inputValue, attachments, doSend]);

  const handleSendDirect = useCallback(async (prompt: string) => {
    await doSend(prompt, prompt);
  }, [doSend]);

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
        onExportChat={handleExportChat}
        onOpenSettings={() => setSettingsOpen(true)}
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
              onSendPrompt={handleSendDirect}
              onBranchChat={handleBranchChat}
              chatCost={activeChat?.costUsd}
              chatDuration={activeChat?.durationMs}
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

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        chatSettings={activeChat?.settings || { systemPrompt: "", maxTurns: 0, maxBudgetUsd: 0 }}
        onChatSettingsChange={handleChatSettingsChange}
        appSettings={appSettings}
        onAppSettingsChange={handleAppSettingsChange}
      />
    </div>
  );
}
