"use client";

import { useState } from "react";

interface PreviewPanelProps {
  cwd: string;
}

export default function PreviewPanel({ cwd }: PreviewPanelProps) {
  const [url, setUrl] = useState("");
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [inputVisible, setInputVisible] = useState(false);

  const projectName = cwd.split(/[\\/]/).filter(Boolean).pop() || "Project";

  const handleGo = () => {
    if (url.trim()) {
      let finalUrl = url.trim();
      if (!finalUrl.startsWith("http")) finalUrl = "http://" + finalUrl;
      setActiveUrl(finalUrl);
      setInputVisible(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-tertiary border-b border-border">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Preview</span>
        <div className="flex-1" />
        {activeUrl && (
          <>
            <button
              onClick={() => setActiveUrl(null)}
              className="text-text-muted hover:text-text-primary text-[10px]"
              title="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {activeUrl ? (
        <>
          {/* URL bar */}
          <div className="flex items-center gap-1 px-2 py-1 bg-bg-secondary border-b border-border">
            <button
              onClick={() => { const iframe = document.querySelector("#preview-iframe") as HTMLIFrameElement; if (iframe) iframe.src = iframe.src; }}
              className="text-text-muted hover:text-text-primary p-0.5"
              title="Reload"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 8a6 6 0 0111.5-2.3M14 8a6 6 0 01-11.5 2.3" />
                <path d="M14 2v4h-4M2 14v-4h4" />
              </svg>
            </button>
            <span className="text-[10px] text-text-muted truncate flex-1">{activeUrl}</span>
          </div>
          {/* iframe */}
          <div className="flex-1 bg-white">
            <iframe
              id="preview-iframe"
              src={activeUrl}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-bg-tertiary flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
                <rect x="2" y="3" width="20" height="18" rx="3" />
                <path d="M2 7h20" />
                <circle cx="5" cy="5" r="0.5" fill="currentColor" />
                <circle cx="7.5" cy="5" r="0.5" fill="currentColor" />
                <circle cx="10" cy="5" r="0.5" fill="currentColor" />
              </svg>
            </div>
            <p className="text-xs text-text-muted mb-3">
              {projectName}
            </p>
            {inputVisible ? (
              <div className="flex items-center gap-1">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGo()}
                  placeholder="http://localhost:3000"
                  className="px-2 py-1 text-xs bg-bg-tertiary border border-border rounded text-text-primary outline-none focus:border-accent/50 w-48"
                  autoFocus
                />
                <button
                  onClick={handleGo}
                  className="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover"
                >
                  Go
                </button>
              </div>
            ) : (
              <button
                onClick={() => setInputVisible(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M6 8l2 2 4-4" />
                </svg>
                Open URL
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
