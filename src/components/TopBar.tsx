"use client";

import { useState, useRef, useEffect } from "react";
import FolderPicker from "./FolderPicker";

const MODELS = [
  { id: "sonnet", label: "Sonnet 4.6" },
  { id: "opus", label: "Opus 4.6" },
  { id: "haiku", label: "Haiku 4.5" },
];

interface TopBarProps {
  model: string;
  onModelChange: (model: string) => void;
  cwd: string;
  onCwdChange: (cwd: string) => void;
  activeTab: "explorer" | "preview" | null;
  onTabChange: (tab: "explorer" | "preview" | null) => void;
  onMenuClick: () => void;
}

export default function TopBar({
  model,
  onModelChange,
  cwd,
  onCwdChange,
  activeTab,
  onTabChange,
  onMenuClick,
}: TopBarProps) {
  const [modelOpen, setModelOpen] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);

  const selectedModel = MODELS.find((m) => m.id === model) || MODELS[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const cwdLabel = cwd.split(/[\\/]/).filter(Boolean).pop() || cwd;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-bg-secondary/50 min-h-[40px]">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="text-text-secondary hover:text-text-primary md:hidden"
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h14M3 10h14M3 14h14" />
        </svg>
      </button>

      {/* Model selector */}
      <div className="relative" ref={modelRef}>
        <button
          onClick={() => setModelOpen(!modelOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-bg-tertiary border border-border hover:border-border-light text-xs font-medium text-text-primary transition-colors"
        >
          {selectedModel.label}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-text-muted">
            <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        {modelOpen && (
          <div className="absolute top-full left-0 mt-1 w-40 bg-bg-tertiary border border-border rounded-lg shadow-xl z-50 py-1">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => { onModelChange(m.id); setModelOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover transition-colors ${
                  m.id === model ? "text-accent font-medium" : "text-text-primary"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CWD folder picker */}
      <div className="relative">
        <button
          onClick={() => setFolderPickerOpen(!folderPickerOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-bg-tertiary border border-border hover:border-border-light text-xs text-text-secondary hover:text-text-primary transition-colors truncate max-w-[200px]"
          title={cwd}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 text-text-muted">
            <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
          </svg>
          {cwdLabel}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-text-muted">
            <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        {folderPickerOpen && (
          <FolderPicker
            cwd={cwd}
            onSelect={onCwdChange}
            onClose={() => setFolderPickerOpen(false)}
          />
        )}
      </div>

      <div className="flex-1" />

      {/* Right panel tabs */}
      <button
        onClick={() => onTabChange(activeTab === "explorer" ? null : "explorer")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
          activeTab === "explorer"
            ? "bg-accent/20 text-accent border border-accent/30"
            : "bg-bg-tertiary border border-border hover:border-border-light text-text-secondary hover:text-text-primary"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
        </svg>
        Explorer
      </button>
      <button
        onClick={() => onTabChange(activeTab === "preview" ? null : "preview")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
          activeTab === "preview"
            ? "bg-accent/20 text-accent border border-accent/30"
            : "bg-bg-tertiary border border-border hover:border-border-light text-text-secondary hover:text-text-primary"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="2" width="14" height="12" rx="2" />
          <path d="M1 5h14" />
        </svg>
        Preview
      </button>
    </div>
  );
}
