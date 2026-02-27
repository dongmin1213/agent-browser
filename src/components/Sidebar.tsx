"use client";

import type { Chat } from "@/types/chat";

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  isOpen,
  onClose,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          ${collapsed ? "w-12" : "w-64"} bg-bg-secondary border-r border-border
          flex flex-col
          transform transition-all duration-200 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Header */}
        <div className={`flex items-center ${collapsed ? "justify-center p-2" : "p-2 gap-1"} border-b border-border`}>
          {!collapsed && (
            <button
              onClick={onNewChat}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-text-primary text-xs font-medium hover:bg-bg-hover transition-colors"
            >
              <span className="text-sm leading-none">+</span>
              New Chat
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            className={`flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors flex-shrink-0 ${collapsed ? "" : ""}`}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              {collapsed ? (
                <path d="M6 3l5 5-5 5" />
              ) : (
                <path d="M10 3L5 8l5 5" />
              )}
            </svg>
          </button>
        </div>

        {/* Collapsed: just icons */}
        {collapsed ? (
          <div className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-1">
            <button
              onClick={onNewChat}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
              title="New Chat"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
            {sortedChats.slice(0, 10).map((chat) => (
              <button
                key={chat.id}
                onClick={() => { onSelectChat(chat.id); onClose(); }}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-[10px] font-medium transition-colors ${
                  chat.id === activeChatId
                    ? "bg-bg-tertiary text-accent"
                    : "text-text-muted hover:text-text-primary hover:bg-bg-hover"
                }`}
                title={chat.title}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 4h12M2 8h8M2 12h10" />
                </svg>
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Chat list */}
            <div className="flex-1 overflow-y-auto py-1">
              {sortedChats.length === 0 ? (
                <p className="text-text-muted text-xs text-center py-8">
                  No conversations yet
                </p>
              ) : (
                sortedChats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => {
                      onSelectChat(chat.id);
                      onClose();
                    }}
                    className={`
                      group flex items-center px-2 py-2 mx-1.5 rounded-lg cursor-pointer
                      transition-colors text-xs
                      ${
                        chat.id === activeChatId
                          ? "bg-bg-tertiary text-text-primary"
                          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                      }
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{chat.title}</div>
                      <div className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1">
                        {chat.cwd && (
                          <>
                            <span className="truncate max-w-[100px]">{chat.cwd.split(/[\\/]/).pop()}</span>
                            <span>&middot;</span>
                          </>
                        )}
                        {formatTime(chat.updatedAt)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 ml-1 w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-error hover:bg-error/10 transition-all text-[10px]"
                      title="Delete"
                    >
                      &#x2715;
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-border">
              <div className="text-[10px] text-text-muted text-center">
                Claude Agent SDK Chat v0.1
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
