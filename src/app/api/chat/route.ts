import { NextRequest } from "next/server";
import { runAgent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { message, sessionId, model, cwd, systemPrompt, maxTurns, maxBudgetUsd, mcpServers } = body as {
    message: string;
    sessionId?: string;
    model?: string;
    cwd?: string;
    systemPrompt?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    mcpServers?: { id: string; name: string; command: string; args: string[]; enabled: boolean }[];
  };

  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const agentStream = runAgent({
          prompt: message,
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
