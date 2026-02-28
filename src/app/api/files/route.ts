import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const dir = request.nextUrl.searchParams.get("dir") || process.cwd();

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => ({
        name: e.name,
        path: path.join(dir, e.name),
        isDirectory: e.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return Response.json({ items, cwd: dir });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return Response.json({ items: [], cwd: dir, error: `Directory not found: ${dir}` }, { status: 404 });
    }
    if (code === "EACCES" || code === "EPERM") {
      return Response.json({ items: [], cwd: dir, error: `Permission denied: ${dir}` }, { status: 403 });
    }
    return Response.json({ items: [], cwd: dir, error: "Failed to read directory" }, { status: 500 });
  }
}
