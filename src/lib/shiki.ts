// eslint-disable-next-line @typescript-eslint/no-explicit-any
let highlighterPromise: Promise<any> | null = null;

export function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((mod) =>
      mod.createHighlighter({
        themes: ["github-dark"],
        langs: [
          "javascript", "typescript", "jsx", "tsx", "json", "html", "css",
          "python", "rust", "go", "java", "c", "cpp", "csharp", "ruby",
          "php", "swift", "kotlin", "dart", "sql", "yaml", "toml",
          "markdown", "bash", "powershell", "dockerfile", "xml",
        ],
      })
    );
  }
  return highlighterPromise;
}

export async function highlightCode(
  code: string,
  lang: string,
  theme = "github-dark"
): Promise<string> {
  try {
    const highlighter = await getHighlighter();
    const loadedLangs = highlighter.getLoadedLanguages() as string[];
    const targetLang = lang || "text";
    if (targetLang !== "text" && !loadedLangs.includes(targetLang)) {
      try {
        await highlighter.loadLanguage(targetLang);
      } catch {
        return highlighter.codeToHtml(code, { lang: "text", theme });
      }
    }
    return highlighter.codeToHtml(code, { lang: targetLang, theme });
  } catch {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<pre style="background:#0d1117;color:#e6edf3;padding:1em;overflow-x:auto"><code>${escaped}</code></pre>`;
  }
}
