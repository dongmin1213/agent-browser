import type { Chat, UIMessage, AppSettings } from "@/types/chat";

const STORAGE_KEY = "claude-agent-chats";
const APP_SETTINGS_KEY = "claude-agent-app-settings";

// =========================================
// Persistence
// =========================================

export function loadChats(): Chat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const chats: Chat[] = raw ? JSON.parse(raw) : [];
    // Migrate old chats without new fields
    return chats.map((c) => ({
      ...c,
      settings: c.settings || { systemPrompt: "", maxTurns: 0, maxBudgetUsd: 0 },
      costUsd: c.costUsd || 0,
      durationMs: c.durationMs || 0,
    }));
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

export function loadAppSettings(): AppSettings {
  if (typeof window === "undefined") {
    return { theme: "dark", mcpServers: [], defaultSystemPrompt: "", defaultMaxTurns: 0, defaultMaxBudgetUsd: 0 };
  }
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return { theme: "dark", mcpServers: [], defaultSystemPrompt: "", defaultMaxTurns: 0, defaultMaxBudgetUsd: 0 };
    return { ...{ theme: "dark", mcpServers: [], defaultSystemPrompt: "", defaultMaxTurns: 0, defaultMaxBudgetUsd: 0 }, ...JSON.parse(raw) };
  } catch {
    return { theme: "dark", mcpServers: [], defaultSystemPrompt: "", defaultMaxTurns: 0, defaultMaxBudgetUsd: 0 };
  }
}

export function saveAppSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
}

// =========================================
// Chat CRUD
// =========================================

export function createChat(model = "opus", cwd = "", appSettings?: AppSettings): Chat {
  return {
    id: crypto.randomUUID(),
    title: "New Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sessionId: null,
    messages: [],
    model,
    cwd,
    settings: {
      systemPrompt: appSettings?.defaultSystemPrompt || "",
      maxTurns: appSettings?.defaultMaxTurns || 0,
      maxBudgetUsd: appSettings?.defaultMaxBudgetUsd || 0,
    },
    costUsd: 0,
    durationMs: 0,
  };
}

export function updateChatSettings(
  chats: Chat[],
  chatId: string,
  settings: Partial<Pick<Chat, "model" | "cwd" | "settings">>
): Chat[] {
  return chats.map((c) =>
    c.id === chatId ? { ...c, ...settings, updatedAt: Date.now() } : c
  );
}

export function deleteChat(chats: Chat[], chatId: string): Chat[] {
  return chats.filter((c) => c.id !== chatId);
}

export function updateChatTitle(
  chats: Chat[],
  chatId: string,
  title: string
): Chat[] {
  return chats.map((c) =>
    c.id === chatId ? { ...c, title, updatedAt: Date.now() } : c
  );
}

export function addMessageToChat(
  chats: Chat[],
  chatId: string,
  message: UIMessage
): Chat[] {
  return chats.map((c) =>
    c.id === chatId
      ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
      : c
  );
}

export function updateMessageInChat(
  chats: Chat[],
  chatId: string,
  messageId: string,
  updater: (msg: UIMessage) => UIMessage
): Chat[] {
  return chats.map((c) =>
    c.id === chatId
      ? {
          ...c,
          messages: c.messages.map((m) =>
            m.id === messageId ? updater(m) : m
          ),
          updatedAt: Date.now(),
        }
      : c
  );
}

export function updateMessageByToolUseId(
  chats: Chat[],
  chatId: string,
  toolUseId: string,
  updater: (msg: UIMessage) => UIMessage
): Chat[] {
  return chats.map((c) =>
    c.id === chatId
      ? {
          ...c,
          messages: c.messages.map((m) =>
            m.role === "tool_use" &&
            (m as { toolUseId: string }).toolUseId === toolUseId
              ? updater(m)
              : m
          ),
          updatedAt: Date.now(),
        }
      : c
  );
}

export function setChatSessionId(
  chats: Chat[],
  chatId: string,
  sessionId: string
): Chat[] {
  return chats.map((c) =>
    c.id === chatId ? { ...c, sessionId, updatedAt: Date.now() } : c
  );
}

export function updateChatCost(
  chats: Chat[],
  chatId: string,
  costUsd: number,
  durationMs: number
): Chat[] {
  return chats.map((c) =>
    c.id === chatId
      ? {
          ...c,
          costUsd: c.costUsd + costUsd,
          durationMs: c.durationMs + durationMs,
          updatedAt: Date.now(),
        }
      : c
  );
}

// =========================================
// Branch Chat
// =========================================

export function branchChat(
  chats: Chat[],
  sourceChatId: string,
  messageIndex: number
): { chats: Chat[]; newChatId: string } | null {
  const source = chats.find((c) => c.id === sourceChatId);
  if (!source) return null;

  const newChat: Chat = {
    id: crypto.randomUUID(),
    title: source.title + " (branch)",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sessionId: null, // New session for branch
    messages: source.messages.slice(0, messageIndex + 1),
    model: source.model,
    cwd: source.cwd,
    settings: { ...source.settings },
    costUsd: 0,
    durationMs: 0,
    branchedFrom: { chatId: sourceChatId, messageIndex },
  };

  return { chats: [...chats, newChat], newChatId: newChat.id };
}

// =========================================
// Export
// =========================================

export function exportChatAsMarkdown(chat: Chat): string {
  const lines: string[] = [];
  lines.push(`# ${chat.title}`);
  lines.push(`> Model: ${chat.model} | CWD: ${chat.cwd}`);
  lines.push(`> Created: ${new Date(chat.createdAt).toLocaleString()}`);
  if (chat.costUsd > 0) {
    lines.push(`> Cost: $${chat.costUsd.toFixed(4)}`);
  }
  lines.push("");

  for (const msg of chat.messages) {
    switch (msg.role) {
      case "user":
        lines.push(`## User\n\n${msg.content}\n`);
        break;
      case "assistant":
        lines.push(`## Assistant\n\n${msg.content}\n`);
        break;
      case "tool_use":
        lines.push(`### Tool: ${msg.toolName}\n\n\`\`\`json\n${JSON.stringify(msg.input, null, 2)}\n\`\`\`\n`);
        break;
      case "tool_result":
        lines.push(`### Result${msg.isError ? " (Error)" : ""}\n\n\`\`\`\n${msg.content}\n\`\`\`\n`);
        break;
      case "error":
        lines.push(`### Error\n\n${msg.content}\n`);
        break;
    }
  }

  return lines.join("\n");
}

export function exportChatAsJSON(chat: Chat): string {
  return JSON.stringify(chat, null, 2);
}

// =========================================
// Utilities
// =========================================

export function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  return trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed;
}
