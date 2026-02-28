"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type {
  Chat,
  UIMessage,
  StreamEvent,
  AssistantTextMessage,
  ToolUseMessage,
  ToolResultMessage,
  ErrorMessage,
  PlanApprovalMessage,
  AskUserMessage,
  AppSettings,
  Attachment,
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
  reorderChats,
  togglePinMessage,
} from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import MessageInput from "@/components/MessageInput";
import { SLASH_COMMANDS } from "@/lib/slash-commands";
import TopBar from "@/components/TopBar";
import ExplorerPanel from "@/components/ExplorerPanel";
import PreviewPanel from "@/components/PreviewPanel";
import SettingsModal from "@/components/SettingsModal";
import { ToastProvider, useToast } from "@/components/Toast";

// =========================================
// NDJSON Stream Reader
// =========================================

const STREAM_TOTAL_TIMEOUT = 10 * 60 * 1000; // 10 minutes max
const STREAM_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes no activity

async function readNDJSONStream(
  response: Response,
  onEvent: (event: StreamEvent) => void
) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const startTime = Date.now();
  let lastActivity = Date.now();

  try {
    while (true) {
      // Check total timeout
      if (Date.now() - startTime > STREAM_TOTAL_TIMEOUT) {
        reader.cancel();
        throw new Error("Stream timeout: response took too long (3 min limit)");
      }

      // Race between read and idle timeout
      const readPromise = reader.read();
      const idlePromise = new Promise<never>((_, reject) => {
        const remaining = STREAM_IDLE_TIMEOUT - (Date.now() - lastActivity);
        setTimeout(() => reject(new Error("Stream idle: no data for 60 seconds")), Math.max(remaining, 0));
      });

      const { done, value } = await Promise.race([readPromise, idlePromise]);
      if (done) break;

      lastActivity = Date.now();
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
  } catch (err) {
    // Silently handle stream abort/disconnect errors
    // AbortError, network errors, and Event objects can be thrown here
    if (err instanceof Error && err.name !== "AbortError") {
      throw err;
    }
    // Non-Error objects (like Event) are silently ignored
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
  return (
    <ToastProvider>
      <HomeInner />
    </ToastProvider>
  );
}

function HomeInner() {
  const { addToast } = useToast();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingChatIds, setLoadingChatIds] = useState<Set<string>>(new Set());
  const [inputValue, setInputValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [defaultCwd, setDefaultCwd] = useState("");
  const [rightPanel, setRightPanel] = useState<"explorer" | "preview" | null>("explorer");
  const [rightPanelWidth, setRightPanelWidth] = useState(66);
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
  const quotaWarned = useRef(false);
  useEffect(() => {
    if (chats.length > 0) {
      const ok = saveChats(chats);
      if (!ok && !quotaWarned.current) {
        quotaWarned.current = true;
        addToast("warning", "Storage almost full. Some data may not be saved. Consider exporting and clearing old chats.");
      }
    }
  }, [chats, addToast]);

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

  const handleReorderChat = useCallback((chatId: string, newIndex: number) => {
    setChats((prev) => reorderChats(prev, chatId, newIndex));
  }, []);

  const handleRenameChat = useCallback((chatId: string, newTitle: string) => {
    setChats((prev) => updateChatTitle(prev, chatId, newTitle));
  }, []);

  const handleTogglePin = useCallback((messageId: string) => {
    if (!activeChatId) return;
    setChats((prev) => togglePinMessage(prev, activeChatId, messageId));
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

        case "plan_approval": {
          // Clean up any stuck streaming states
          setChats((prev) =>
            prev.map((c) => {
              if (c.id !== chatId) return c;
              const cleaned = c.messages.map((m) => {
                if (m.role === "assistant" && (m as AssistantTextMessage).isStreaming) {
                  return { ...m, isStreaming: false };
                }
                if (m.role === "tool_use" && (m as ToolUseMessage).isRunning) {
                  return { ...m, isRunning: false };
                }
                return m;
              });
              return { ...c, messages: cleaned };
            })
          );
          // Add PlanApprovalMessage with allowedPrompts and plan content
          const planMsg: PlanApprovalMessage = {
            id: crypto.randomUUID(),
            role: "plan_approval",
            status: "pending",
            timestamp: Date.now(),
            allowedPrompts: event.allowedPrompts,
            planContent: event.planContent,
          };
          setChats((prev) => addMessageToChat(prev, chatId, planMsg));
          // Clean up loading state (no result event follows)
          setLoadingChatIds((prev) => { const next = new Set(prev); next.delete(chatId); return next; });
          streamStateRef.current.delete(chatId);
          break;
        }

        case "ask_user": {
          // Clean up any stuck streaming states
          setChats((prev) =>
            prev.map((c) => {
              if (c.id !== chatId) return c;
              const cleaned = c.messages.map((m) => {
                if (m.role === "assistant" && (m as AssistantTextMessage).isStreaming) {
                  return { ...m, isStreaming: false };
                }
                if (m.role === "tool_use" && (m as ToolUseMessage).isRunning) {
                  return { ...m, isRunning: false };
                }
                return m;
              });
              return { ...c, messages: cleaned };
            })
          );
          // Add AskUserMessage
          const askMsg: AskUserMessage = {
            id: crypto.randomUUID(),
            role: "ask_user",
            status: "pending",
            questions: event.questions,
            timestamp: Date.now(),
          };
          setChats((prev) => addMessageToChat(prev, chatId, askMsg));
          // Clean up loading state
          setLoadingChatIds((prev) => { const next = new Set(prev); next.delete(chatId); return next; });
          streamStateRef.current.delete(chatId);
          break;
        }

        case "result": {
          // Clean up any stuck streaming/running states
          setChats((prev) =>
            prev.map((c) => {
              if (c.id !== chatId) return c;
              const cleaned = c.messages.map((m) => {
                if (m.role === "assistant" && (m as AssistantTextMessage).isStreaming) {
                  return { ...m, isStreaming: false };
                }
                if (m.role === "tool_use" && (m as ToolUseMessage).isRunning) {
                  return { ...m, isRunning: false };
                }
                return m;
              });
              return { ...c, messages: cleaned };
            })
          );
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
          // Clean up any stuck streaming/running states
          setChats((prev) =>
            prev.map((c) => {
              if (c.id !== chatId) return c;
              const cleaned = c.messages.map((m) => {
                if (m.role === "assistant" && (m as AssistantTextMessage).isStreaming) {
                  return { ...m, isStreaming: false };
                }
                if (m.role === "tool_use" && (m as ToolUseMessage).isRunning) {
                  return { ...m, isRunning: false };
                }
                return m;
              });
              return { ...c, messages: cleaned };
            })
          );
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

  const doSend = useCallback(async (fullMessage: string, displayText: string, images?: string[]) => {
    let chatId = activeChatIdRef.current;
    if (!chatId) {
      const newChat = createChat("opus", defaultCwd, appSettings);
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      chatId = newChat.id;
      activeChatIdRef.current = chatId;
    }

    // Don't send if THIS chat is already loading
    if (abortControllersRef.current.has(chatId)) return;

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayText,
      timestamp: Date.now(),
      ...(images && images.length > 0 ? { images } : {}),
    };
    setChats((prev) => addMessageToChat(prev, chatId!, userMsg));
    setLoadingChatIds((prev) => new Set(prev).add(chatId!));

    const chat = chatsRef.current.find((c) => c.id === chatId);
    const sessionId = chat?.sessionId || undefined;
    const chatSettings = chat?.settings;
    const chatModel = chat?.model || "opus";
    const chatCwd = chat?.cwd || defaultCwd;

    // Create per-chat stream handler (chatId captured in closure)
    const onEvent = createStreamHandler(chatId);

    try {
      const controller = new AbortController();
      abortControllersRef.current.set(chatId, controller);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fullMessage,
          sessionId,
          model: chatModel,
          cwd: chatCwd || undefined,
          systemPrompt: chatSettings?.systemPrompt || appSettings.defaultSystemPrompt || undefined,
          maxTurns: chatSettings?.maxTurns || appSettings.defaultMaxTurns || undefined,
          maxBudgetUsd: chatSettings?.maxBudgetUsd || appSettings.defaultMaxBudgetUsd || undefined,
          mcpServers: appSettings.mcpServers.length > 0 ? appSettings.mcpServers : undefined,
          images: images && images.length > 0 ? images : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await readNDJSONStream(response, onEvent);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setLoadingChatIds((prev) => { const next = new Set(prev); next.delete(chatId!); return next; });
        streamStateRef.current.delete(chatId!);
        return;
      }
      const errMsg: ErrorMessage = {
        id: crypto.randomUUID(),
        role: "error",
        content: err instanceof Error ? err.message : "Failed to connect to agent",
        timestamp: Date.now(),
      };
      setChats((prev) => addMessageToChat(prev, chatId!, errMsg));
      setLoadingChatIds((prev) => { const next = new Set(prev); next.delete(chatId!); return next; });
      streamStateRef.current.delete(chatId!);
    } finally {
      // Always clean up: abort controller, loading state, stream state
      abortControllersRef.current.delete(chatId!);
      setLoadingChatIds((prev) => { const next = new Set(prev); next.delete(chatId!); return next; });
      streamStateRef.current.delete(chatId!);
    }
  }, [createStreamHandler, defaultCwd, appSettings]);

  const handleSend = useCallback(async () => {
    const message = inputValue.trim();
    if (!message && attachments.length === 0) return;

    const textAtts = attachments.filter((a) => a.type !== "image");
    const imageAtts = attachments.filter((a) => a.type === "image");

    let fullMessage = message;
    if (textAtts.length > 0) {
      const attachmentText = textAtts
        .map((a) => `<file name="${a.name}">\n${a.content}\n</file>`)
        .join("\n\n");
      fullMessage = attachmentText + (message ? "\n\n" + message : "");
    }

    // Collect display text
    const allNames = attachments.map((a) => a.name);
    const displayText = allNames.length > 0
      ? (message || "") + `\n\n\uD83D\uDCCE ${allNames.join(", ")}`
      : message;

    // Upload images to server first, get back file paths (avoids localStorage overflow)
    let imagePaths: string[] = [];
    if (imageAtts.length > 0) {
      try {
        const chatCwd = chatsRef.current.find((c) => c.id === activeChatIdRef.current)?.cwd || defaultCwd;
        const res = await fetch("/api/upload-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: imageAtts.map((a) => a.dataUrl!), cwd: chatCwd || undefined }),
        });
        const data = await res.json();
        imagePaths = data.paths || [];
      } catch {
        addToast("warning", "Image upload failed. Images will not be included.");
      }
    }

    setInputValue("");
    setAttachments([]);
    await doSend(fullMessage, displayText, imagePaths);
  }, [inputValue, attachments, doSend, defaultCwd]);

  const handleSendDirect = useCallback(async (prompt: string) => {
    await doSend(prompt, prompt);
  }, [doSend]);

  const handleStop = useCallback(() => {
    const chatId = activeChatIdRef.current;
    if (!chatId) return;
    const controller = abortControllersRef.current.get(chatId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(chatId);
    }
    setLoadingChatIds((prev) => { const next = new Set(prev); next.delete(chatId); return next; });
    streamStateRef.current.delete(chatId);
  }, []);

  // =========================================
  // Slash Commands
  // =========================================

  const slashCommands = useMemo(() => SLASH_COMMANDS, []);

  const handleCommand = useCallback((command: string, args: string) => {
    const chatId = activeChatIdRef.current;

    switch (command) {
      case "clear": {
        if (!chatId) return;
        setChats((prev) =>
          prev.map((c) => c.id === chatId ? { ...c, messages: [] as UIMessage[], sessionId: null, costUsd: 0, durationMs: 0 } : c)
        );
        break;
      }
      case "compact": {
        if (!chatId) return;
        const chat = chatsRef.current.find((c) => c.id === chatId);
        if (!chat || chat.messages.length === 0) return;

        // Build conversation text from messages
        const convoLines: string[] = [];
        for (const m of chat.messages) {
          if (m.role === "user") convoLines.push(`User: ${(m as { content: string }).content}`);
          else if (m.role === "assistant") convoLines.push(`Assistant: ${(m as AssistantTextMessage).content}`);
          else if (m.role === "tool_use") convoLines.push(`[Tool: ${(m as ToolUseMessage).toolName}]`);
          else if (m.role === "tool_result") convoLines.push(`[Tool Result: ${String((m as ToolResultMessage).content).slice(0, 200)}]`);
        }
        const conversationText = convoLines.join("\n");
        const userInstructions = args.trim() || "Focus on key decisions, code changes, and current state.";

        // Show compacting indicator
        const compactingMsg: AssistantTextMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Compacting conversation...",
          timestamp: Date.now(),
          isStreaming: true,
        };
        setChats((prev) => addMessageToChat(prev, chatId, compactingMsg));

        // Call API for AI summary (new session, dedicated system prompt)
        const compactChatId = chatId;
        const compactMsgId = compactingMsg.id;
        (async () => {
          try {
            const chatCwd = chat.cwd || defaultCwd;
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: `Here is the conversation so far:\n\n${conversationText}\n\nPlease provide a concise summary. ${userInstructions}`,
                model: chat.model || "haiku",
                cwd: chatCwd || undefined,
                systemPrompt: "You are a conversation summarizer. Provide a concise but complete summary of the conversation. Include: key topics discussed, decisions made, code changes, current state, and any pending tasks. Output ONLY the summary in markdown format, no preamble.",
                maxTurns: 1,
              }),
            });

            if (!response.ok) throw new Error("Compact failed");

            // Read full response to get summary text
            let summaryText = "";
            if (response.body) {
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                  if (!line.trim()) continue;
                  try {
                    const event = JSON.parse(line) as StreamEvent;
                    if (event.type === "text_delta") {
                      summaryText += event.text;
                      // Live update the compacting message
                      setChats((prev) =>
                        updateMessageInChat(prev, compactChatId, compactMsgId, (msg) => ({
                          ...msg,
                          content: summaryText,
                        }))
                      );
                    }
                  } catch { /* skip */ }
                }
              }
              // Process remaining buffer
              if (buffer.trim()) {
                try {
                  const event = JSON.parse(buffer) as StreamEvent;
                  if (event.type === "text_delta") summaryText += event.text;
                } catch { /* skip */ }
              }
            }

            if (!summaryText.trim()) summaryText = "Failed to generate summary.";

            // Replace all messages with just the compact summary
            const summaryMsg: AssistantTextMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `**Conversation Summary (compacted)**\n\n${summaryText}`,
              timestamp: Date.now(),
              isStreaming: false,
            };
            setChats((prev) =>
              prev.map((c) =>
                c.id === compactChatId
                  ? { ...c, messages: [summaryMsg], sessionId: null }
                  : c
              )
            );
          } catch {
            // On error, remove the compacting message
            setChats((prev) =>
              updateMessageInChat(prev, compactChatId, compactMsgId, (msg) => ({
                ...msg,
                content: "Compact failed. Please try again.",
                isStreaming: false,
              }))
            );
          }
        })();
        break;
      }
      case "model": {
        const modelMap: Record<string, string> = { opus: "opus", sonnet: "sonnet", haiku: "haiku" };
        const target = modelMap[args.trim().toLowerCase()];
        if (target && chatId) {
          setChats((prev) => updateChatSettings(prev, chatId, { model: target }));
          // Show confirmation as system-like message
          const msg: AssistantTextMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Model switched to **${args.trim().toLowerCase()}**.`,
            timestamp: Date.now(),
            isStreaming: false,
          };
          setChats((prev) => addMessageToChat(prev, chatId, msg));
        } else {
          // Show usage hint
          const msg: AssistantTextMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Usage: `/model <opus|sonnet|haiku>`",
            timestamp: Date.now(),
            isStreaming: false,
          };
          if (chatId) setChats((prev) => addMessageToChat(prev, chatId, msg));
        }
        break;
      }
      case "help": {
        if (!chatId) {
          const newChat = createChat("opus", defaultCwd, appSettings);
          setChats((prev) => [newChat, ...prev]);
          setActiveChatId(newChat.id);
          activeChatIdRef.current = newChat.id;
        }
        const targetId = activeChatIdRef.current!;
        const helpText = [
          "**Available Commands:**",
          "",
          "| Command | Description |",
          "|---------|-------------|",
          "| `/clear` | Clear all messages in current chat |",
          "| `/compact [instructions]` | Summarize conversation to save context |",
          "| `/download <path>` | Download a file from server |",
          "| `/model <opus\\|sonnet\\|haiku>` | Switch model |",
          "| `/usage` | Show token usage and cost |",
          "| `/export [md\\|json]` | Export chat |",
          "| `/help` | Show this help |",
          "",
          "**Keyboard Shortcuts:**",
          "",
          "| Shortcut | Action |",
          "|----------|--------|",
          "| `Ctrl+N` | New chat |",
          "| `Ctrl+K` | Search conversations |",
          "| `Ctrl+,` | Settings |",
          "| `Ctrl+E` | Toggle Explorer |",
          "| `Ctrl+Shift+E` | Export as Markdown |",
        ].join("\n");
        const msg: AssistantTextMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: helpText,
          timestamp: Date.now(),
          isStreaming: false,
        };
        setChats((prev) => addMessageToChat(prev, targetId, msg));
        break;
      }
      case "usage": {
        if (!chatId) return;
        const chat = chatsRef.current.find((c) => c.id === chatId);
        const cost = chat?.costUsd || 0;
        const duration = chat?.durationMs || 0;
        const msgCount = chat?.messages.length || 0;
        const usageText = [
          "**Session Usage:**",
          "",
          `- Messages: **${msgCount}**`,
          `- Cost: **$${cost.toFixed(4)}**`,
          `- Duration: **${(duration / 1000).toFixed(1)}s**`,
          `- Model: **${chat?.model || "opus"}**`,
          `- Session ID: \`${chat?.sessionId || "none"}\``,
        ].join("\n");
        const msg: AssistantTextMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: usageText,
          timestamp: Date.now(),
          isStreaming: false,
        };
        setChats((prev) => addMessageToChat(prev, chatId, msg));
        break;
      }
      case "export": {
        if (!chatId) return;
        const format = args.trim().toLowerCase() === "json" ? "json" : "md";
        handleExportChat(chatId, format as "md" | "json");
        break;
      }
      case "download": {
        const filePath = args.trim();
        if (!filePath) {
          if (!chatId) return;
          const msg: AssistantTextMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Usage: `/download <file path>`\n\nExample: `/download C:\\project\\build\\app.apk`",
            timestamp: Date.now(),
            isStreaming: false,
          };
          setChats((prev) => addMessageToChat(prev, chatId, msg));
          return;
        }
        // Trigger browser download
        const downloadUrl = `/api/download?path=${encodeURIComponent(filePath)}`;
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Show confirmation
        if (chatId) {
          const fileName = filePath.split(/[\\/]/).pop() || filePath;
          const msg: AssistantTextMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Downloading **${fileName}**...`,
            timestamp: Date.now(),
            isStreaming: false,
          };
          setChats((prev) => addMessageToChat(prev, chatId, msg));
        }
        break;
      }
    }
  }, [doSend, defaultCwd, appSettings, handleExportChat]);

  // =========================================
  // Plan Approval Handler
  // =========================================

  const handlePlanApproval = useCallback(async (approved: boolean, feedback?: string) => {
    const chatId = activeChatIdRef.current;
    if (!chatId) return;

    // Update PlanApprovalMessage status
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.role === "plan_approval" && (m as PlanApprovalMessage).status === "pending"
              ? { ...m, status: approved ? "approved" : "rejected", feedback } as PlanApprovalMessage
              : m
          ),
        };
      })
    );

    // Resume session with approval/rejection message
    if (approved) {
      const msg = feedback
        ? `The user approved the plan with these additional comments: ${feedback}. Proceed with implementation, incorporating the user's feedback.`
        : "The user approved the plan. Proceed with implementation.";
      const display = feedback ? `Plan approved: ${feedback}` : "Plan approved";
      await doSend(msg, display);
    } else {
      await doSend(
        `The user rejected the plan. Please revise based on this feedback: ${feedback}`,
        `Plan rejected: ${feedback}`
      );
    }
  }, [doSend]);

  // =========================================
  // AskUserQuestion Answer Handler
  // =========================================

  const handleAskUserAnswer = useCallback(async (answers: Record<string, string>) => {
    const chatId = activeChatIdRef.current;
    if (!chatId) return;

    // Update AskUserMessage status
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.role === "ask_user" && (m as AskUserMessage).status === "pending"
              ? { ...m, status: "answered", answers } as AskUserMessage
              : m
          ),
        };
      })
    );

    // Format answers as human-readable text for session resume
    const answerLines = Object.entries(answers)
      .map(([question, answer]) => `Q: ${question}\nA: ${answer}`)
      .join("\n\n");

    const displayText = Object.values(answers).join(", ").slice(0, 80);

    await doSend(
      `The user answered the questions:\n\n${answerLines}`,
      `Answered: ${displayText}`
    );
  }, [doSend]);

  // =========================================
  // Render
  // =========================================

  const isCurrentChatLoading = loadingChatIds.has(activeChatId || "");

  // Stable callbacks for child components (prevent re-renders on inputValue change)
  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const handleCloseSidebar = useCallback(() => setSidebarOpen(false), []);
  const handleOpenSidebar = useCallback(() => setSidebarOpen(true), []);
  const handleToggleCollapse = useCallback(() => setSidebarCollapsed((p) => !p), []);
  const handleAttach = useCallback((files: Attachment[]) => setAttachments((prev) => [...prev, ...files]), []);
  const handleRemoveAttachment = useCallback((i: number) => setAttachments((prev) => prev.filter((_, j) => j !== i)), []);

  // Stable memoized values
  const activeMessages = useMemo(() => activeChat?.messages || [], [activeChat?.messages]);
  const activeChatSettings = useMemo(
    () => activeChat?.settings || { systemPrompt: "", maxTurns: 0, maxBudgetUsd: 0 },
    [activeChat?.settings]
  );

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
        onOpenSettings={handleOpenSettings}
        onReorderChat={handleReorderChat}
        onRenameChat={handleRenameChat}
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
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
          onMenuClick={handleOpenSidebar}
        />

        {/* Content area with optional right panel */}
        <div className="flex-1 flex min-h-0" ref={containerRef}>
          {/* Chat column */}
          <div className="flex flex-col min-w-0" style={{ width: rightPanel ? `${100 - rightPanelWidth}%` : "100%" }}>
            <ChatArea
              messages={activeMessages}
              isLoading={isCurrentChatLoading}
              onSendPrompt={handleSendDirect}
              onBranchChat={handleBranchChat}
              onPlanApproval={handlePlanApproval}
              onAskUserAnswer={handleAskUserAnswer}
              onTogglePin={handleTogglePin}
              chatCost={activeChat?.costUsd}
              chatDuration={activeChat?.durationMs}
            />
            <MessageInput
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSend}
              onStop={handleStop}
              onCommand={handleCommand}
              isLoading={isCurrentChatLoading}
              attachments={attachments}
              onAttach={handleAttach}
              onRemoveAttachment={handleRemoveAttachment}
              slashCommands={slashCommands}
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
              {rightPanel === "preview" && <PreviewPanel cwd={cwd} appSettings={appSettings} />}
            </div>
          )}
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={handleCloseSettings}
        chatSettings={activeChatSettings}
        onChatSettingsChange={handleChatSettingsChange}
        appSettings={appSettings}
        onAppSettingsChange={handleAppSettingsChange}
      />
    </div>
  );
}
