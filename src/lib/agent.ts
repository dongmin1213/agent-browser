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

  // Build allowedTools list - include MCP tool patterns for enabled servers
  const baseTools = [
    "Read",
    "Edit",
    "Write",
    "Bash",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "Task",
    "ExitPlanMode",
  ];

  // Add MCP tool patterns for enabled servers (format: mcp__<serverName>)
  if (mcpServers && mcpServers.length > 0) {
    const enabledServers = mcpServers.filter((s) => s.enabled);
    for (const server of enabledServers) {
      baseTools.push(`mcp__${server.name}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: Record<string, any> = {
    allowedTools: baseTools,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    // Enable real token-level streaming
    includePartialMessages: true,
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

  // Track streaming state to avoid duplicate processing
  let isStreamingText = false;
  // Map of content block index → tool_use_id for streaming tool inputs
  const toolUseBlockMap = new Map<number, { toolUseId: string; toolName: string }>();
  // Track assistant text content for plan content capture
  let currentAssistantText = "";

  // ExitPlanMode detection — suppress events and yield plan_approval
  let exitPlanModeDetected = false;
  let exitPlanModeBlockIndex = -1;
  let exitPlanModeToolUseId = "";
  let exitPlanModeInputBuffer = "";

  // AskUserQuestion detection — suppress events and yield ask_user
  let askUserDetected = false;
  let askUserBlockIndex = -1;
  let askUserToolUseId = "";
  let askUserInputBuffer = "";

  try {
    for await (const message of query({ prompt, options })) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = message as any;

      // 1. System init -> capture session_id
      if (msg.type === "system" && msg.subtype === "init") {
        yield { type: "session_init", sessionId: msg.session_id };
        continue;
      }

      // 2. Real-time streaming events (token-level)
      if (msg.type === "stream_event") {
        const event = msg.event;
        if (!event) continue;

        switch (event.type) {
          case "content_block_start": {
            const block = event.content_block;
            if (block?.type === "text") {
              isStreamingText = true;
            } else if (block?.type === "tool_use") {
              // Detect ExitPlanMode — suppress its events
              if (block.name === "ExitPlanMode") {
                exitPlanModeDetected = true;
                exitPlanModeBlockIndex = event.index;
                exitPlanModeToolUseId = block.id;
                break;
              }
              // Detect AskUserQuestion — suppress its events
              if (block.name === "AskUserQuestion") {
                askUserDetected = true;
                askUserBlockIndex = event.index;
                askUserToolUseId = block.id;
                break;
              }
              toolUseBlockMap.set(event.index, {
                toolUseId: block.id,
                toolName: block.name,
              });
              yield {
                type: "tool_use_start",
                toolName: block.name,
                toolUseId: block.id,
              };
            }
            break;
          }

          case "content_block_delta": {
            const delta = event.delta;
            if (delta?.type === "text_delta" && delta.text) {
              currentAssistantText += delta.text;
              yield { type: "text_delta", text: delta.text };
            } else if (delta?.type === "input_json_delta" && delta.partial_json) {
              // Capture and suppress input deltas for ExitPlanMode
              if (exitPlanModeDetected && event.index === exitPlanModeBlockIndex) {
                exitPlanModeInputBuffer += delta.partial_json;
                break;
              }
              // Capture and suppress input deltas for AskUserQuestion
              if (askUserDetected && event.index === askUserBlockIndex) {
                askUserInputBuffer += delta.partial_json;
                break;
              }
              yield { type: "tool_use_input_delta", partialJson: delta.partial_json };
            }
            break;
          }

          case "content_block_stop": {
            if (isStreamingText) {
              yield { type: "text_done" };
              isStreamingText = false;
            }
            // Tool use content_block_stop is handled by the full assistant message
            break;
          }
        }
        continue;
      }

      // 3. Full assistant message (after streaming completes for this turn)
      if (msg.type === "assistant") {
        const content = msg.message?.content || msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && block.text) {
              // Text was already streamed via stream_event, skip
              // But if somehow not streamed, emit as fallback
              if (!isStreamingText && toolUseBlockMap.size === 0) {
                // Fallback: emit complete text if stream_events weren't received
                yield { type: "text_delta", text: block.text };
                yield { type: "text_done" };
              }
            } else if (block.type === "tool_use") {
              // Suppress ExitPlanMode tool_use_done
              if (exitPlanModeDetected && block.id === exitPlanModeToolUseId) {
                continue;
              }
              // Suppress AskUserQuestion tool_use_done
              if (askUserDetected && block.id === askUserToolUseId) {
                continue;
              }
              // Emit tool_use_done with complete input
              const tracked = toolUseBlockMap.get(
                content.indexOf(block)
              );
              if (tracked) {
                yield {
                  type: "tool_use_done",
                  toolUseId: tracked.toolUseId,
                  input: block.input || {},
                };
              } else {
                // Tool wasn't tracked from streaming, emit full lifecycle
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
        }
        // Reset per-turn state
        toolUseBlockMap.clear();
        // Don't reset assistant text if we need it for plan content or ask_user
        if (!exitPlanModeDetected && !askUserDetected) {
          currentAssistantText = "";
        }
        yield { type: "turn_done" };
        continue;
      }

      // 4. User messages with tool results (SDK internal)
      if (msg.type === "user") {
        const content = msg.message?.content || msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_result") {
              // Suppress ExitPlanMode tool_result
              if (exitPlanModeDetected && block.tool_use_id === exitPlanModeToolUseId) {
                continue;
              }
              // Suppress AskUserQuestion tool_result
              if (askUserDetected && block.tool_use_id === askUserToolUseId) {
                continue;
              }
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

        // After processing tool results, if ExitPlanMode was detected:
        // yield plan_approval and stop the generator to pause the agent
        if (exitPlanModeDetected) {
          let allowedPrompts: { tool: string; prompt: string }[] | undefined;
          try {
            const parsed = JSON.parse(exitPlanModeInputBuffer);
            if (parsed.allowedPrompts && Array.isArray(parsed.allowedPrompts)) {
              allowedPrompts = parsed.allowedPrompts;
            }
          } catch { /* partial JSON — ignore */ }
          yield { type: "plan_approval", allowedPrompts, planContent: currentAssistantText || undefined };
          return; // Stop generator — session is saved, can resume later
        }

        // After processing tool results, if AskUserQuestion was detected:
        // yield ask_user and stop the generator to pause the agent
        if (askUserDetected) {
          let questions: { question: string; header: string; options: { label: string; description: string }[]; multiSelect: boolean }[] = [];
          try {
            const parsed = JSON.parse(askUserInputBuffer);
            if (parsed.questions && Array.isArray(parsed.questions)) {
              questions = parsed.questions;
            }
          } catch { /* partial JSON — ignore */ }
          yield { type: "ask_user", questions };
          return; // Stop generator — session is saved, can resume later
        }
        continue;
      }

      // 5. Result message (final)
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
      message: classifyAgentError(err),
    };
  }
}

function classifyAgentError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("enoent") || lower.includes("not found") || lower.includes("not recognized")) {
    return `Claude CLI not found. Make sure Claude Code CLI is installed and in PATH.\n\nOriginal: ${msg}`;
  }
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return `Rate limited by API. Please wait a moment and try again.\n\nOriginal: ${msg}`;
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) {
    return `Request timed out. The agent took too long to respond.\n\nOriginal: ${msg}`;
  }
  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("auth") || lower.includes("api key")) {
    return `Authentication failed. Check your Claude CLI auth (run 'claude' to re-authenticate).\n\nOriginal: ${msg}`;
  }
  if (lower.includes("network") || lower.includes("econnrefused") || lower.includes("econnreset") || lower.includes("fetch failed")) {
    return `Network error. Check your internet connection.\n\nOriginal: ${msg}`;
  }
  if (lower.includes("overloaded") || lower.includes("503") || lower.includes("529")) {
    return `API is overloaded. Please try again in a few seconds.\n\nOriginal: ${msg}`;
  }

  return msg;
}
