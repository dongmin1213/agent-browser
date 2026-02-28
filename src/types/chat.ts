// =========================================
// UI Message Types (for React state)
// =========================================

export type UIMessage =
  | UserMessage
  | AssistantTextMessage
  | ToolUseMessage
  | ToolResultMessage
  | ErrorMessage
  | PlanApprovalMessage;

interface BaseMessage {
  id: string;
  timestamp: number;
}

export interface UserMessage extends BaseMessage {
  role: "user";
  content: string;
  images?: string[]; // base64 data URLs for display
}

// =========================================
// Attachment (used in MessageInput + page.tsx)
// =========================================

export interface Attachment {
  name: string;
  content: string;
  type: "text" | "image";
  dataUrl?: string; // base64 data URL for image preview
}

export interface AssistantTextMessage extends BaseMessage {
  role: "assistant";
  content: string;
  isStreaming: boolean;
}

export interface ToolUseMessage extends BaseMessage {
  role: "tool_use";
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  isRunning: boolean;
}

export interface ToolResultMessage extends BaseMessage {
  role: "tool_result";
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface ErrorMessage extends BaseMessage {
  role: "error";
  content: string;
}

export interface PlanApprovalMessage extends BaseMessage {
  role: "plan_approval";
  status: "pending" | "approved" | "rejected";
  feedback?: string;
}

// =========================================
// MCP Server Config
// =========================================

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
}

// =========================================
// Chat Settings
// =========================================

export interface ChatSettings {
  systemPrompt: string;
  maxTurns: number;        // 0 = unlimited
  maxBudgetUsd: number;    // 0 = unlimited
}

// =========================================
// Chat Type (stored in localStorage)
// =========================================

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sessionId: string | null;
  messages: UIMessage[];
  model: string;
  cwd: string;
  // New fields
  settings: ChatSettings;
  costUsd: number;
  durationMs: number;
  branchedFrom?: { chatId: string; messageIndex: number };
}

// =========================================
// App-level Settings (persisted separately)
// =========================================

export interface AppSettings {
  theme: "dark" | "light";
  mcpServers: McpServerConfig[];
  defaultSystemPrompt: string;
  defaultMaxTurns: number;
  defaultMaxBudgetUsd: number;
  wsScrcpyPath: string;
  wsScrcpyPort: number;
}

export const DEFAULT_MCP_SERVERS: McpServerConfig[] = [
  {
    id: "playwright-default",
    name: "playwright",
    command: "npx",
    args: ["@playwright/mcp@latest"],
    enabled: true,
  },
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "dark",
  mcpServers: [...DEFAULT_MCP_SERVERS],
  defaultSystemPrompt: "",
  defaultMaxTurns: 0,
  defaultMaxBudgetUsd: 0,
  wsScrcpyPath: "",
  wsScrcpyPort: 8000,
};

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  systemPrompt: "",
  maxTurns: 0,
  maxBudgetUsd: 0,
};

// =========================================
// Project Detection & Dev Server Types
// =========================================

export type ProjectFramework =
  | "nextjs" | "vite" | "cra" | "vue-cli" | "nuxt"
  | "angular" | "svelte" | "remix" | "astro"
  | "flutter" | "unknown";

export type DevServerStatus = "stopped" | "starting" | "running" | "error" | "port_occupied";

export interface ProjectInfo {
  framework: ProjectFramework;
  name: string;
  devCommand: string;
  defaultPort: number;
  isFlutter: boolean;
  flutterModes?: ("web" | "device")[];
}

export interface DevServerState {
  status: DevServerStatus;
  port: number;
  url: string | null;
  error: string | null;
  pid: number | null;
}

// =========================================
// Stream Event Types (NDJSON protocol)
// Backend -> Frontend communication
// =========================================

export type StreamEvent =
  | { type: "session_init"; sessionId: string }
  | { type: "text_delta"; text: string }
  | { type: "text_done" }
  | { type: "tool_use_start"; toolName: string; toolUseId: string }
  | { type: "tool_use_input_delta"; partialJson: string }
  | { type: "tool_use_done"; toolUseId: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError: boolean }
  | { type: "turn_done" }
  | { type: "plan_approval" }
  | { type: "result"; result: string; costUsd?: number; durationMs?: number }
  | { type: "error"; message: string };
