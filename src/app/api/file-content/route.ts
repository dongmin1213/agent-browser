import { NextRequest } from "next/server";
import fs from "fs";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");
  if (!filePath) {
    return Response.json({ error: "path is required" }, { status: 400 });
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 512 * 1024) {
      return Response.json({ content: "// File too large to preview (>512KB)", language: "text" });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const langMap: Record<string, string> = {
      ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
      py: "python", rs: "rust", go: "go", java: "java", json: "json",
      css: "css", html: "html", md: "markdown", yaml: "yaml", yml: "yaml",
      toml: "toml", sql: "sql", sh: "bash", bat: "batch", ps1: "powershell",
    };

    return Response.json({ content, language: langMap[ext] || "text" });
  } catch {
    return Response.json({ error: "Failed to read file" }, { status: 500 });
  }
}
