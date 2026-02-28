"use client";

import { useState, useEffect, useCallback, useRef, memo } from "react";

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface ExplorerPanelProps {
  cwd: string;
  onFileSelect?: (filePath: string) => void;
}

function FileIcon({ isDirectory, name }: { isDirectory: boolean; name: string }) {
  if (isDirectory) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="#e8a838" className="flex-shrink-0">
        <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
      </svg>
    );
  }
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const colors: Record<string, string> = {
    ts: "#3178c6", tsx: "#3178c6", js: "#f7df1e", jsx: "#f7df1e",
    json: "#5bb882", css: "#563d7c", html: "#e34c26", md: "#fff",
    py: "#3776ab", rs: "#dea584", go: "#00add8",
  };
  const color = colors[ext] || "#8b8b8b";
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill={color} className="flex-shrink-0" opacity="0.8">
      <path d="M3 1h7l3 3v10a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" />
    </svg>
  );
}

function FolderTree({
  dir,
  depth,
  onFileSelect,
  selectedFile,
  refreshCounter,
}: {
  dir: string;
  depth: number;
  onFileSelect?: (path: string) => void;
  selectedFile?: string | null;
  refreshCounter?: number;
}) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    // Only show loading spinner on initial load, not on refreshes
    if (!hasLoaded.current) setLoading(true);
    try {
      const res = await fetch(`/api/files?dir=${encodeURIComponent(dir)}`);
      const data = await res.json();
      if (data.error && (!data.items || data.items.length === 0)) {
        setError(data.error);
        setItems([]);
      } else {
        setError(null);
        setItems(data.items || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setItems([]);
    }
    setLoading(false);
    hasLoaded.current = true;
  }, [dir]);

  useEffect(() => {
    load();
  }, [load, refreshCounter]);

  if (loading && depth === 0) {
    return <div className="text-xs text-text-muted px-3 py-2">Loading...</div>;
  }

  if (error && depth === 0) {
    return (
      <div className="px-3 py-2 text-xs text-red-400">
        {error}
        <button onClick={load} className="ml-2 text-accent hover:text-accent-hover underline">Retry</button>
      </div>
    );
  }

  return (
    <div>
      {items.map((item) => (
        <div key={item.path}>
          <button
            onClick={() => {
              if (item.isDirectory) {
                setExpanded((prev) => {
                  const next = new Set(prev);
                  next.has(item.path) ? next.delete(item.path) : next.add(item.path);
                  return next;
                });
              } else {
                onFileSelect?.(item.path);
              }
            }}
            className={`flex items-center gap-1.5 w-full text-left px-2 py-[3px] text-xs hover:bg-bg-hover transition-colors group ${
              !item.isDirectory && selectedFile === item.path ? "bg-bg-tertiary" : ""
            }`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {item.isDirectory && (
              <svg
                width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                className={`flex-shrink-0 text-text-muted transition-transform ${expanded.has(item.path) ? "rotate-90" : ""}`}
              >
                <path d="M2 1l4 3-4 3z" />
              </svg>
            )}
            {!item.isDirectory && <span className="w-2" />}
            <FileIcon isDirectory={item.isDirectory} name={item.name} />
            <span className={`truncate group-hover:text-text-primary ${
              !item.isDirectory && selectedFile === item.path ? "text-text-primary" : "text-text-secondary"
            }`}>{item.name}</span>
          </button>
          {item.isDirectory && expanded.has(item.path) && (
            <FolderTree
              dir={item.path}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
              refreshCounter={refreshCounter}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function CodePreview({ content, language }: { content: string; language: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { highlightCode } = await import("@/lib/shiki");
        const html = await highlightCode(content, language || "text");
        if (!cancelled) setHighlighted(html);
      } catch {
        // Fallback: no highlighting
        if (!cancelled) setHighlighted(null);
      }
    })();
    return () => { cancelled = true; };
  }, [content, language]);

  if (highlighted) {
    return (
      <div
        ref={containerRef}
        className="flex-1 overflow-auto text-[11px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-3 [&_code]:!text-[11px]"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    );
  }

  return (
    <pre className="flex-1 overflow-auto p-3 text-[11px] leading-relaxed text-text-secondary bg-bg-primary m-0 border-0 rounded-none">
      {content}
    </pre>
  );
}

export default memo(function ExplorerPanel({ cwd, onFileSelect }: ExplorerPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLanguage, setFileLanguage] = useState("text");
  const [treeWidth, setTreeWidth] = useState(40); // percentage
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const selectedFileRef = useRef<string | null>(null);

  // Reset selected file when cwd changes (chat switch)
  useEffect(() => {
    setSelectedFile(null);
    setFileContent(null);
    setFileLanguage("text");
  }, [cwd]);

  // Keep ref in sync with state for SSE callback
  useEffect(() => {
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

  // SSE file watcher with exponential backoff reconnect
  const [sseStatus, setSseStatus] = useState<"connected" | "reconnecting" | "disconnected">("connected");

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const MAX_RETRIES = 5;

    function connect() {
      if (cancelled) return;
      es = new EventSource(`/api/watch?dir=${encodeURIComponent(cwd)}`);

      es.onopen = () => {
        retryCount = 0;
        if (!cancelled) setSseStatus("connected");
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "change") {
            setRefreshCounter((c) => c + 1);
            const currentFile = selectedFileRef.current;
            if (currentFile && Array.isArray(data.files)) {
              const normalizedCurrent = currentFile.replace(/\\/g, "/");
              const wasModified = data.files.some(
                (f: string) => f.replace(/\\/g, "/") === normalizedCurrent
              );
              if (wasModified) {
                fetch(`/api/file-content?path=${encodeURIComponent(currentFile)}`)
                  .then((res) => res.json())
                  .then((d) => {
                    setFileContent(d.content || d.error || "");
                    setFileLanguage(d.language || "text");
                  })
                  .catch(() => {});
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        es?.close();
        if (cancelled) return;
        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 16000);
          retryCount++;
          setSseStatus("reconnecting");
          retryTimer = setTimeout(connect, delay);
        } else {
          setSseStatus("disconnected");
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [cwd]);

  const handleFileSelect = async (filePath: string) => {
    setSelectedFile(filePath);
    onFileSelect?.(filePath);
    try {
      const res = await fetch(`/api/file-content?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      setFileContent(data.content || data.error || "");
      setFileLanguage(data.language || "text");
    } catch {
      setFileContent("Failed to load file");
      setFileLanguage("text");
    }
  };

  const handleMouseDown = useCallback(() => {
    isDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setTreeWidth(Math.min(70, Math.max(20, pct)));
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

  const fileName = selectedFile?.split(/[\\/]/).pop();

  return (
    <div className="flex h-full" ref={containerRef}>
      {/* File tree */}
      <div
        className="overflow-y-auto border-r border-border flex-shrink-0"
        style={{ width: selectedFile ? `${treeWidth}%` : "100%" }}
      >
        <div className="flex items-center gap-1.5 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Explorer</span>
          {sseStatus === "reconnecting" && (
            <span className="text-[9px] text-yellow-400" title="Reconnecting file watcher...">
              <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor" className="animate-spin inline">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3z" opacity="0.3" />
                <path d="M8 1a7 7 0 017 7h-2a5 5 0 00-5-5V1z" />
              </svg>
            </span>
          )}
          {sseStatus === "disconnected" && (
            <span className="text-[9px] text-red-400" title="File watcher disconnected">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3" /></svg>
            </span>
          )}
        </div>
        <FolderTree
          dir={cwd}
          depth={0}
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile}
          refreshCounter={refreshCounter}
        />
      </div>

      {/* Drag handle */}
      {selectedFile && (
        <div
          onMouseDown={handleMouseDown}
          className="w-1 hover:w-1 bg-border hover:bg-accent/50 cursor-col-resize transition-colors flex-shrink-0"
        />
      )}

      {/* File preview */}
      {selectedFile && (
        <div className="flex-1 flex flex-col min-w-0 bg-bg-primary">
          <div className="flex items-center justify-between px-3 py-1.5 bg-bg-tertiary border-b border-border">
            <span className="text-[11px] text-text-secondary truncate">{fileName}</span>
            <button
              onClick={() => { setSelectedFile(null); setFileContent(null); }}
              className="text-text-muted hover:text-text-primary flex-shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </div>
          {fileContent !== null ? (
            <CodePreview content={fileContent} language={fileLanguage} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-text-muted">Loading...</div>
          )}
        </div>
      )}
    </div>
  );
});
