import { NextRequest } from "next/server";
import { runAgent } from "@/lib/agent";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes

// Save base64 data URL images to temp files, return file paths
async function saveImagesToTemp(images: string[], cwd?: string): Promise<string[]> {
  const paths: string[] = [];
  const dir = cwd || tmpdir();
  const tempDir = join(dir, ".claude-images");

  try {
    await mkdir(tempDir, { recursive: true });
  } catch {
    // ignore if exists
  }

  for (let i = 0; i < images.length; i++) {
    const dataUrl = images[i];
    // Parse data URL: data:image/png;base64,xxxx
    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) continue;

    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const base64Data = match[2];
    const fileName = `pasted-${Date.now()}-${i}.${ext}`;
    const filePath = join(tempDir, fileName);

    try {
      await writeFile(filePath, Buffer.from(base64Data, "base64"));
      paths.push(filePath);
    } catch {
      // skip on write error
    }
  }

  return paths;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { message, sessionId, model, cwd, systemPrompt, maxTurns, maxBudgetUsd, mcpServers, images } = body as {
    message: string;
    sessionId?: string;
    model?: string;
    cwd?: string;
    systemPrompt?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    mcpServers?: { id: string; name: string; command: string; args: string[]; enabled: boolean }[];
    images?: string[];
  };

  // Allow empty text if images are attached
  if ((!message || typeof message !== "string") && (!images || images.length === 0)) {
    return new Response(JSON.stringify({ error: "message or images required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Images are now pre-saved file paths (uploaded via /api/upload-images)
  // Fallback: if images look like base64 data URLs, save them to temp files
  let prompt = message || "";
  if (images && images.length > 0) {
    let imagePaths: string[];
    const hasDataUrls = images.some((img) => img.startsWith("data:"));
    if (hasDataUrls) {
      imagePaths = await saveImagesToTemp(images, cwd);
    } else {
      // Already file paths
      imagePaths = images;
    }
    if (imagePaths.length > 0) {
      const imageRefs = imagePaths.map((p) => `[Attached Image: ${p}]`).join("\n");
      prompt = prompt ? `${imageRefs}\n\n${prompt}` : `${imageRefs}\n\nPlease analyze these images.`;
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const agentStream = runAgent({
          prompt,
          sessionId: sessionId || undefined,
          model: model || undefined,
          cwd: cwd || undefined,
          systemPrompt: systemPrompt || undefined,
          maxTurns: maxTurns || undefined,
          maxBudgetUsd: maxBudgetUsd || undefined,
          mcpServers: mcpServers || undefined,
        });

        for await (const event of agentStream) {
          const line = JSON.stringify(event) + "\n";
          controller.enqueue(encoder.encode(line));
        }
      } catch (err) {
        const errorEvent = {
          type: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorEvent) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
