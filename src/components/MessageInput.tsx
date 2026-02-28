"use client";

import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent, DragEvent, ClipboardEvent } from "react";
import type { Attachment } from "@/types/chat";

export interface SlashCommand {
  name: string;
  description: string;
  args?: string; // placeholder for argument (e.g., "<instructions>")
}

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onCommand: (command: string, args: string) => void;
  isLoading: boolean;
  attachments: Attachment[];
  onAttach: (files: Attachment[]) => void;
  onRemoveAttachment: (index: number) => void;
  slashCommands: SlashCommand[];
}

// Helper: read File as base64 data URL
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MessageInput({
  value,
  onChange,
  onSend,
  onStop,
  onCommand,
  isLoading,
  attachments,
  onAttach,
  onRemoveAttachment,
  slashCommands,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const [showCommands, setShowCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const commandMenuRef = useRef<HTMLDivElement>(null);

  // Filter commands based on input
  const filteredCommands = value.startsWith("/")
    ? slashCommands.filter((cmd) =>
        `/${cmd.name}`.toLowerCase().startsWith(value.split(" ")[0].toLowerCase())
      )
    : [];

  // Show/hide command menu
  useEffect(() => {
    if (value.startsWith("/") && !value.includes(" ") && filteredCommands.length > 0) {
      setShowCommands(true);
      setSelectedCommandIndex(0);
    } else {
      setShowCommands(false);
    }
  }, [value, filteredCommands.length]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [value]);

  useEffect(() => {
    if (!isLoading) textareaRef.current?.focus();
  }, [isLoading]);

  const executeCommand = (cmd: SlashCommand) => {
    onChange(`/${cmd.name} `);
    setShowCommands(false);
    // If command has no args, execute immediately
    if (!cmd.args) {
      onCommand(cmd.name, "");
      onChange("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Command menu navigation
    if (showCommands) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const cmd = filteredCommands[selectedCommandIndex];
        if (cmd) executeCommand(cmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowCommands(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Check for slash command execution
      const trimmed = value.trim();
      if (trimmed.startsWith("/")) {
        const parts = trimmed.split(/\s+/);
        const cmdName = parts[0].slice(1); // remove leading /
        const cmdArgs = parts.slice(1).join(" ");
        const cmd = slashCommands.find((c) => c.name === cmdName);
        if (cmd) {
          onCommand(cmdName, cmdArgs);
          onChange("");
          return;
        }
      }
      if (!isLoading && (trimmed || attachments.length > 0)) onSend();
    }
  };

  // Handle image paste (Ctrl+V)
  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems: DataTransferItem[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        imageItems.push(item);
      }
    }

    if (imageItems.length === 0) return; // Let default text paste happen

    e.preventDefault(); // Prevent default only when we have images

    const newAttachments: Attachment[] = [];
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const ext = file.type.split("/")[1] || "png";
        const name = `pasted-image-${Date.now()}.${ext}`;
        newAttachments.push({
          name,
          content: dataUrl, // base64 data URL
          type: "image",
          dataUrl,
        });
      } catch {
        // skip
      }
    }
    if (newAttachments.length > 0) onAttach(newAttachments);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        // Image file
        try {
          const dataUrl = await readFileAsDataUrl(file);
          newAttachments.push({ name: file.name, content: dataUrl, type: "image", dataUrl });
        } catch {
          // skip
        }
      } else {
        // Text file
        const text = await file.text();
        newAttachments.push({ name: file.name, content: text, type: "text" });
      }
    }
    onAttach(newAttachments);
    e.target.value = "";
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files.length) return;
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        try {
          const dataUrl = await readFileAsDataUrl(file);
          newAttachments.push({ name: file.name, content: dataUrl, type: "image", dataUrl });
        } catch {
          // skip
        }
      } else {
        try {
          const text = await file.text();
          newAttachments.push({ name: file.name, content: text, type: "text" });
        } catch {
          // skip binary files
        }
      }
    }
    if (newAttachments.length > 0) onAttach(newAttachments);
  };

  const textAttachments = attachments.filter((a) => a.type !== "image");
  const imageAttachments = attachments.filter((a) => a.type === "image");

  return (
    <div
      className={`border-t border-border bg-bg-primary px-4 py-3 transition-all ${
        isDragging ? "ring-2 ring-inset ring-accent/50 bg-accent/5" : ""
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="max-w-3xl mx-auto">
        {/* Drag overlay hint */}
        {isDragging && (
          <div className="flex items-center justify-center gap-2 mb-2 py-2 rounded-lg border-2 border-dashed border-accent/40 text-accent text-xs">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2v12M2 8h12" />
            </svg>
            Drop files or images here
          </div>
        )}

        {/* Image attachment previews */}
        {imageAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {imageAttachments.map((att, i) => {
              const globalIndex = attachments.indexOf(att);
              return (
                <div key={i} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    className="w-16 h-16 object-cover rounded-lg border border-border"
                  />
                  <button
                    onClick={() => onRemoveAttachment(globalIndex)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-bg-primary border border-border rounded-full flex items-center justify-center text-text-muted hover:text-error hover:border-error transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <svg width="6" height="6" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 2l4 4M6 2l-4 4" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Text attachment chips */}
        {textAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {textAttachments.map((att, i) => {
              const globalIndex = attachments.indexOf(att);
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-tertiary border border-border rounded text-[11px] text-text-secondary"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted">
                    <path d="M3 1h7l3 3v10a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" />
                  </svg>
                  {att.name}
                  <button
                    onClick={() => onRemoveAttachment(globalIndex)}
                    className="text-text-muted hover:text-error ml-0.5"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 2l4 4M6 2l-4 4" />
                    </svg>
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Slash command menu */}
        {showCommands && (
          <div
            ref={commandMenuRef}
            className="mb-1 bg-bg-secondary border border-border rounded-lg shadow-lg overflow-hidden"
          >
            {filteredCommands.map((cmd, i) => (
              <button
                key={cmd.name}
                onClick={() => executeCommand(cmd)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  i === selectedCommandIndex ? "bg-accent/15 text-accent" : "text-text-primary hover:bg-bg-hover"
                }`}
              >
                <span className="font-mono text-xs font-semibold text-accent">/{cmd.name}</span>
                <span className="text-text-muted text-xs">{cmd.description}</span>
                {cmd.args && <span className="text-text-muted text-[10px] opacity-60 ml-auto">{cmd.args}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 bg-bg-secondary rounded-xl border border-border focus-within:border-accent/50 transition-colors p-2">
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Attach file"
            disabled={isLoading}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M13.5 7.5l-5.793 5.793a3 3 0 01-4.243 0v0a3 3 0 010-4.243L9.88 2.636a2 2 0 012.828 0v0a2 2 0 010 2.828L6.293 11.88a1 1 0 01-1.414 0v0a1 1 0 010-1.414L10.5 4.843" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            accept=".txt,.md,.ts,.tsx,.js,.jsx,.py,.rs,.go,.java,.json,.css,.html,.yaml,.yml,.toml,.sql,.sh,.bat,.ps1,.csv,.xml,.env,.gitignore,.cfg,.ini,.log,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp"
          />

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isDragging ? "Drop files here..." : "Send a message... (paste images with Ctrl+V)"}
            rows={1}
            className="flex-1 bg-transparent text-text-primary placeholder-text-muted text-sm resize-none outline-none px-2 py-1.5 max-h-[200px]"
            disabled={isLoading}
          />

          {isLoading ? (
            <button
              onClick={onStop}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-error/20 text-error hover:bg-error/30 transition-colors"
              title="Stop"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="2" y="2" width="10" height="10" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!value.trim() && attachments.length === 0}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Send"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 14V2M2 8l6-6 6 6" />
              </svg>
            </button>
          )}
        </div>
        <div className="text-center mt-1.5">
          <span className="text-[10px] text-text-muted">
            Claude Agent SDK &middot; Enter to send, Shift+Enter for newline
          </span>
        </div>
      </div>
    </div>
  );
}
