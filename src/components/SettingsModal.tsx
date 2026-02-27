"use client";

import { useState, useEffect } from "react";
import type { ChatSettings, AppSettings, McpServerConfig } from "@/types/chat";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Chat-level settings
  chatSettings: ChatSettings;
  onChatSettingsChange: (settings: ChatSettings) => void;
  // App-level settings
  appSettings: AppSettings;
  onAppSettingsChange: (settings: AppSettings) => void;
}

type Tab = "chat" | "mcp" | "app";

export default function SettingsModal({
  isOpen,
  onClose,
  chatSettings,
  onChatSettingsChange,
  appSettings,
  onAppSettingsChange,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>("chat");
  const [localChat, setLocalChat] = useState(chatSettings);
  const [localApp, setLocalApp] = useState(appSettings);

  // MCP form state
  const [mcpName, setMcpName] = useState("");
  const [mcpCommand, setMcpCommand] = useState("");
  const [mcpArgs, setMcpArgs] = useState("");

  useEffect(() => {
    setLocalChat(chatSettings);
    setLocalApp(appSettings);
  }, [chatSettings, appSettings, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onChatSettingsChange(localChat);
    onAppSettingsChange(localApp);
    onClose();
  };

  const addMcpServer = () => {
    if (!mcpName || !mcpCommand) return;
    const server: McpServerConfig = {
      id: crypto.randomUUID(),
      name: mcpName.trim(),
      command: mcpCommand.trim(),
      args: mcpArgs.trim() ? mcpArgs.split(" ") : [],
      enabled: true,
    };
    setLocalApp((prev) => ({
      ...prev,
      mcpServers: [...prev.mcpServers, server],
    }));
    setMcpName("");
    setMcpCommand("");
    setMcpArgs("");
  };

  const removeMcpServer = (id: string) => {
    setLocalApp((prev) => ({
      ...prev,
      mcpServers: prev.mcpServers.filter((s) => s.id !== id),
    }));
  };

  const toggleMcpServer = (id: string) => {
    setLocalApp((prev) => ({
      ...prev,
      mcpServers: prev.mcpServers.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s
      ),
    }));
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "chat", label: "Chat" },
    { key: "mcp", label: "MCP Servers" },
    { key: "app", label: "Defaults" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg w-[560px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text-secondary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === "chat" && (
            <>
              {/* System Prompt */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  System Prompt (this chat)
                </label>
                <textarea
                  value={localChat.systemPrompt}
                  onChange={(e) => setLocalChat((p) => ({ ...p, systemPrompt: e.target.value }))}
                  placeholder="Custom instructions for this chat..."
                  className="w-full h-28 bg-bg-primary border border-border rounded-md px-3 py-2 text-xs text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent"
                />
              </div>
              {/* Max Turns */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Max Turns <span className="text-text-muted">(0 = unlimited)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={localChat.maxTurns}
                    onChange={(e) => setLocalChat((p) => ({ ...p, maxTurns: Number(e.target.value) || 0 }))}
                    className="w-full bg-bg-primary border border-border rounded-md px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Max Budget USD <span className="text-text-muted">(0 = unlimited)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={localChat.maxBudgetUsd}
                    onChange={(e) => setLocalChat((p) => ({ ...p, maxBudgetUsd: Number(e.target.value) || 0 }))}
                    className="w-full bg-bg-primary border border-border rounded-md px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            </>
          )}

          {tab === "mcp" && (
            <>
              <p className="text-xs text-text-muted">
                Add MCP servers to extend Claude with external tools (browser, database, etc.)
              </p>
              {/* Server List */}
              {localApp.mcpServers.length > 0 && (
                <div className="space-y-2">
                  {localApp.mcpServers.map((server) => (
                    <div key={server.id} className="flex items-center gap-2 bg-bg-primary border border-border rounded-md px-3 py-2">
                      <button onClick={() => toggleMcpServer(server.id)} className="flex-shrink-0">
                        <div className={`w-3.5 h-3.5 rounded border ${server.enabled ? "bg-accent border-accent" : "border-border"} flex items-center justify-center`}>
                          {server.enabled && (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5">
                              <path d="M1.5 4L3 5.5L6.5 2" />
                            </svg>
                          )}
                        </div>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-text-primary truncate">{server.name}</div>
                        <div className="text-[10px] text-text-muted truncate">
                          {server.command} {server.args.join(" ")}
                        </div>
                      </div>
                      <button
                        onClick={() => removeMcpServer(server.id)}
                        className="text-text-muted hover:text-red-400 flex-shrink-0"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M3 3l6 6M9 3l-6 6" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Add new */}
              <div className="bg-bg-primary border border-border rounded-md p-3 space-y-2">
                <div className="text-xs font-medium text-text-secondary">Add Server</div>
                <input
                  value={mcpName}
                  onChange={(e) => setMcpName(e.target.value)}
                  placeholder="Name (e.g. playwright)"
                  className="w-full bg-bg-secondary border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
                <input
                  value={mcpCommand}
                  onChange={(e) => setMcpCommand(e.target.value)}
                  placeholder="Command (e.g. npx)"
                  className="w-full bg-bg-secondary border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
                <input
                  value={mcpArgs}
                  onChange={(e) => setMcpArgs(e.target.value)}
                  placeholder="Args (space-separated, e.g. @playwright/mcp@latest)"
                  className="w-full bg-bg-secondary border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
                <button
                  onClick={addMcpServer}
                  disabled={!mcpName || !mcpCommand}
                  className="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/80 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            </>
          )}

          {tab === "app" && (
            <>
              {/* Theme */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Theme</label>
                <div className="flex gap-2">
                  {(["dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setLocalApp((p) => ({ ...p, theme: t }))}
                      className={`px-4 py-1.5 text-xs rounded-md border transition-colors ${
                        localApp.theme === t
                          ? "border-accent text-accent bg-accent/10"
                          : "border-border text-text-muted hover:text-text-secondary"
                      }`}
                    >
                      {t === "dark" ? "Dark" : "Light"}
                    </button>
                  ))}
                </div>
              </div>
              {/* Default System Prompt */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Default System Prompt <span className="text-text-muted">(for new chats)</span>
                </label>
                <textarea
                  value={localApp.defaultSystemPrompt}
                  onChange={(e) => setLocalApp((p) => ({ ...p, defaultSystemPrompt: e.target.value }))}
                  placeholder="Default instructions for all new chats..."
                  className="w-full h-20 bg-bg-primary border border-border rounded-md px-3 py-2 text-xs text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent"
                />
              </div>
              {/* Default Limits */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Default Max Turns
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={localApp.defaultMaxTurns}
                    onChange={(e) => setLocalApp((p) => ({ ...p, defaultMaxTurns: Number(e.target.value) || 0 }))}
                    className="w-full bg-bg-primary border border-border rounded-md px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Default Max Budget USD
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={localApp.defaultMaxBudgetUsd}
                    onChange={(e) => setLocalApp((p) => ({ ...p, defaultMaxBudgetUsd: Number(e.target.value) || 0 }))}
                    className="w-full bg-bg-primary border border-border rounded-md px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-text-muted hover:text-text-secondary border border-border rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent/80"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
