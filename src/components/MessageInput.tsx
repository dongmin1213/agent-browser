"use client";

import { useRef, useEffect, KeyboardEvent, ChangeEvent } from "react";

interface Attachment {
  name: string;
  content: string;
}

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isLoading: boolean;
  attachments: Attachment[];
  onAttach: (files: Attachment[]) => void;
  onRemoveAttachment: (index: number) => void;
}

export default function MessageInput({
  value,
  onChange,
  onSend,
  onStop,
  isLoading,
  attachments,
  onAttach,
  onRemoveAttachment,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && (value.trim() || attachments.length > 0)) onSend();
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      const text = await file.text();
      newAttachments.push({ name: file.name, content: text });
    }
    onAttach(newAttachments);
    e.target.value = "";
  };

  return (
    <div className="border-t border-border bg-bg-primary px-4 py-3">
      <div className="max-w-3xl mx-auto">
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachments.map((att, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-tertiary border border-border rounded text-[11px] text-text-secondary"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted">
                  <path d="M3 1h7l3 3v10a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" />
                </svg>
                {att.name}
                <button
                  onClick={() => onRemoveAttachment(i)}
                  className="text-text-muted hover:text-error ml-0.5"
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 2l4 4M6 2l-4 4" />
                  </svg>
                </button>
              </span>
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
            accept=".txt,.md,.ts,.tsx,.js,.jsx,.py,.rs,.go,.java,.json,.css,.html,.yaml,.yml,.toml,.sql,.sh,.bat,.ps1,.csv,.xml,.env,.gitignore,.cfg,.ini,.log"
          />

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
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
