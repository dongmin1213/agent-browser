import type { Chat, UIMessage } from "@/types/chat";

const STORAGE_KEY = "claude-agent-chats";

// =========================================
// Persistence
// =========================================

export function loadChats(): Chat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

// =========================================
// Chat CRUD
// =========================================

export function createChat(model = "opus", cwd = ""): Chat {
  return {
    id: crypto.randomUUID(),
    title: "New Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sessionId: null,
    messages: [],
    model,
    cwd,
  };
}

export function updateChatSettings(
  chats: Chat[],
  chatId: string,
  settings: Partial<Pick<Chat, "model" | "cwd">>
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

// =========================================
// Utilities
// =========================================

export function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  return trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed;
}
