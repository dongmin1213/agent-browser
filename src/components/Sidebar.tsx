"use client";

import { useState, useRef, useCallback, memo } from "react";
import type { Chat } from "@/types/chat";

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onExportChat: (chatId: string, format: "md" | "json") => void;
  onOpenSettings: () => void;
  onReorderChat: (chatId: string, newIndex: number) => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
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

function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => {
    // If both have order, use order
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
    // If only one has order, it goes first
    if (a.order !== undefined) return -1;
    if (b.order !== undefined) return 1;
    // Otherwise sort by updatedAt descending
    return b.updatedAt - a.updatedAt;
  });
}

export default memo(function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onExportChat,
  onOpenSettings,
  onReorderChat,
  onRenameChat,
  isOpen,
  onClose,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [exportMenuId, setExportMenuId] = useState<string | null>(null);

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartY = useRef<number>(0);

  // Rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const sortedChats = sortChats(chats);

  const filteredChats = searchQuery.trim()
    ? sortedChats.filter((chat) => {
        const q = searchQuery.toLowerCase();
        if (chat.title.toLowerCase().includes(q)) return true;
        return chat.messages.some(
          (m) => "content" in m && typeof m.content === "string" && m.content.toLowerCase().includes(q)
        );
      })
    : sortedChats;

  // ---- Drag handlers ----
  const handleDragStart = useCallback((e: React.DragEvent, chatId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", chatId);
    setDragId(chatId);
    dragStartY.current = e.clientY;
    // Make drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    setDragId(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const chatId = e.dataTransfer.getData("text/plain");
    if (chatId) {
      onReorderChat(chatId, targetIndex);
    }
    setDragId(null);
    setDragOverIndex(null);
  }, [onReorderChat]);

  // ---- Rename handlers ----
  const startRename = useCallback((chatId: string, currentTitle: string) => {
    setEditingId(chatId);
    setEditValue(currentTitle);
    // Focus input after render
    setTimeout(() => editInputRef.current?.focus(), 10);
  }, []);

  const commitRename = useCallback(() => {
    if (editingId && editValue.trim()) {
      onRenameChat(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue("");
  }, [editingId, editValue, onRenameChat]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditValue("");
  }, []);

  const isDragging = dragId !== null;
  const isSearching = searchQuery.trim().length > 0;

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
            className="flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors flex-shrink-0"
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
            <button
              onClick={onOpenSettings}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
              title="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="2" />
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
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
            {/* Search */}
            <div className="px-2 py-1.5">
              <div className="relative">
                <svg
                  width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                >
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M10.5 10.5L14 14" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chats... (Ctrl+K)"
                  className="w-full bg-bg-primary border border-border rounded-md pl-7 pr-2 py-1.5 text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto py-1">
              {filteredChats.length === 0 ? (
                <p className="text-text-muted text-xs text-center py-8">
                  {searchQuery ? "No results found" : "No conversations yet"}
                </p>
              ) : (
                filteredChats.map((chat, index) => {
                  const isEditing = editingId === chat.id;
                  const isDraggedOver = dragOverIndex === index && dragId !== chat.id;

                  return (
                    <div
                      key={chat.id}
                      draggable={!isSearching && !isEditing}
                      onDragStart={(e) => handleDragStart(e, chat.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onClick={() => {
                        if (!isEditing) {
                          onSelectChat(chat.id);
                          onClose();
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        startRename(chat.id, chat.title);
                      }}
                      className={`
                        group flex items-center px-2 py-2 mx-1.5 rounded-lg cursor-pointer
                        transition-all text-xs relative
                        ${isDraggedOver ? "border-t-2 border-accent" : "border-t-2 border-transparent"}
                        ${dragId === chat.id ? "opacity-50" : ""}
                        ${
                          chat.id === activeChatId
                            ? "bg-bg-tertiary text-text-primary"
                            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                        }
                      `}
                    >
                      {/* Drag handle — visible on hover */}
                      {!isSearching && (
                        <div className="opacity-0 group-hover:opacity-60 cursor-grab active:cursor-grabbing mr-1 flex-shrink-0 text-text-muted">
                          <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                            <circle cx="2" cy="2" r="1" />
                            <circle cx="6" cy="2" r="1" />
                            <circle cx="2" cy="6" r="1" />
                            <circle cx="6" cy="6" r="1" />
                            <circle cx="2" cy="10" r="1" />
                            <circle cx="6" cy="10" r="1" />
                          </svg>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") cancelRename();
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-bg-primary border border-accent rounded px-1.5 py-0.5 text-xs text-text-primary focus:outline-none"
                            autoFocus
                          />
                        ) : (
                          <div className="truncate font-medium">{chat.title}</div>
                        )}
                        <div className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1">
                          {chat.cwd && (
                            <>
                              <span className="truncate max-w-[100px]">{chat.cwd.split(/[\\/]/).pop()}</span>
                              <span>&middot;</span>
                            </>
                          )}
                          {formatTime(chat.updatedAt)}
                          {chat.costUsd > 0 && (
                            <>
                              <span>&middot;</span>
                              <span>${chat.costUsd.toFixed(4)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className={`${isDragging ? "hidden" : "opacity-0 group-hover:opacity-100"} flex items-center gap-0.5 flex-shrink-0 ml-1`}>
                        {/* Rename button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(chat.id, chat.title);
                          }}
                          className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all"
                          title="Rename"
                        >
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M11 2l3 3-9 9H2v-3z" />
                            <path d="M9 4l3 3" />
                          </svg>
                        </button>
                        {/* Export button */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExportMenuId(exportMenuId === chat.id ? null : chat.id);
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all"
                            title="Export"
                          >
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M8 2v8M4 6l4-4 4 4M2 12h12" />
                            </svg>
                          </button>
                          {exportMenuId === chat.id && (
                            <div className="absolute right-0 top-6 bg-bg-secondary border border-border rounded-md shadow-lg z-10 py-1 min-w-[100px]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExportChat(chat.id, "md");
                                  setExportMenuId(null);
                                }}
                                className="w-full px-3 py-1 text-[11px] text-left text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                              >
                                Markdown
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExportChat(chat.id, "json");
                                  setExportMenuId(null);
                                }}
                                className="w-full px-3 py-1 text-[11px] text-left text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                              >
                                JSON
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChat(chat.id);
                          }}
                          className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-error hover:bg-error/10 transition-all text-[10px]"
                          title="Delete"
                        >
                          &#x2715;
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-border">
              <button
                onClick={onOpenSettings}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors text-xs"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="2" />
                  <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
                </svg>
                Settings
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
});
