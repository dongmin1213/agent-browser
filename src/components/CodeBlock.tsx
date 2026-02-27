"use client";

import { useState, useEffect } from "react";

interface CodeBlockProps {
  language: string;
  children: string;
}

export default function CodeBlock({ language, children }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const html = await codeToHtml(children, {
          lang: language || "text",
          theme: "github-dark",
        });
        if (!cancelled) setHighlighted(html);
      } catch {
        if (!cancelled) setHighlighted(null);
      }
    })();
    return () => { cancelled = true; };
  }, [children, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper group/code relative my-3 rounded-lg border border-border overflow-hidden bg-[#0d1117]">
      {/* Header: language badge + copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-secondary/80 border-b border-border">
        <span className="text-[11px] text-text-muted font-mono">
          {language || "text"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors"
        >
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 8.5l3.5 3.5L13 4" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="5" width="8" height="8" rx="1" />
                <path d="M3 11V3a1 1 0 011-1h8" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      {highlighted ? (
        <div
          className="overflow-x-auto text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-3 [&_pre]:!border-0 [&_pre]:!rounded-none [&_code]:!text-[13px]"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      ) : (
        <pre className="p-3 overflow-x-auto text-[13px] leading-relaxed text-text-secondary !bg-transparent !border-0 !rounded-none !m-0">
          <code>{children}</code>
        </pre>
      )}
    </div>
  );
}
