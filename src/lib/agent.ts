import { query } from "@anthropic-ai/claude-agent-sdk";
import type { StreamEvent } from "@/types/chat";
import type { McpServerConfig } from "@/types/chat";

export interface AgentQueryParams {
  prompt: string;
  sessionId?: string;
  cwd?: string;
  model?: string;
  systemPrompt?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  mcpServers?: McpServerConfig[];
}

export async function* runAgent(
  params: AgentQueryParams
): AsyncGenerator<StreamEvent> {
  // Unset CLAUDECODE env var to prevent "nested session" error
  delete process.env.CLAUDECODE;

  const { prompt, sessionId, cwd, model, systemPrompt, maxTurns, maxBudgetUsd, mcpServers } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: Record<string, any> = {
    allowedTools: [
      "Read",
      "Edit",
      "Write",
      "Bash",
      "Glob",
      "Grep",
      "WebSearch",
      "WebFetch",
      "Task",
    ],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
  };

  if (sessionId) {
    options.resume = sessionId;
  }

  if (cwd) {
    options.cwd = cwd;
  }

  if (model) {
    const modelMap: Record<string, string> = {
      sonnet: "claude-sonnet-4-6",
      opus: "claude-opus-4-6",
      haiku: "claude-haiku-4-5-20251001",
    };
    options.model = modelMap[model] || model;
  }

  if (systemPrompt) {
    options.systemPrompt = systemPrompt;
  }

  if (maxTurns && maxTurns > 0) {
    options.maxTurns = maxTurns;
  }

  if (maxBudgetUsd && maxBudgetUsd > 0) {
    options.maxBudgetUsd = maxBudgetUsd;
  }

  // MCP servers
  if (mcpServers && mcpServers.length > 0) {
    const enabledServers = mcpServers.filter((s) => s.enabled);
    if (enabledServers.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mcpConfig: Record<string, any> = {};
      for (const server of enabledServers) {
        mcpConfig[server.name] = {
          command: server.command,
          args: server.args,
        };
      }
      options.mcpServers = mcpConfig;
    }
  }

  try {
    for await (const message of query({ prompt, options })) {
      // 1. System init -> capture session_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = message as any;

      if (msg.type === "system" && msg.subtype === "init") {
        yield { type: "session_init", sessionId: msg.session_id };
        continue;
      }

      // 2. Assistant message with content blocks
      if (msg.type === "assistant") {
        const content = msg.message?.content || msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && block.text) {
              yield { type: "text_delta", text: block.text };
              yield { type: "text_done" };
            } else if (block.type === "tool_use") {
              yield {
                type: "tool_use_start",
                toolName: block.name,
                toolUseId: block.id,
              };
              yield {
                type: "tool_use_done",
                toolUseId: block.id,
                input: block.input || {},
              };
            }
          }
        }
        yield { type: "turn_done" };
        continue;
      }

      // 3. User messages with tool results (SDK internal)
      if (msg.type === "user") {
        const content = msg.message?.content || msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_result") {
              const resultText = Array.isArray(block.content)
                ? block.content
                    .map((c: { text?: string }) => c.text || "")
                    .join("\n")
                : typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content);
              yield {
                type: "tool_result",
                toolUseId: block.tool_use_id,
                content: resultText,
                isError: block.is_error === true,
              };
            }
          }
        }
        continue;
      }

      // 4. Result message (final)
      if (msg.type === "result") {
        if (msg.subtype === "success") {
          yield {
            type: "result",
            result: msg.result || "",
            costUsd: msg.total_cost_usd,
            durationMs: msg.duration_ms,
          };
        } else {
          yield {
            type: "error",
            message: `Agent error: ${msg.subtype}${
              msg.errors ? " - " + msg.errors.join(", ") : ""
            }`,
          };
        }
        continue;
      }
    }
  } catch (err) {
    yield {
      type: "error",
      message: err instanceof Error ? err.message : "Unknown agent error",
    };
  }
}
