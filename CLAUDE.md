# Agent Browser - Claude Desktop Web Clone

## Project Overview
A web-based Claude Desktop clone using the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`).
Provides agentic capabilities — file system access, Bash execution, and more — through a web UI via the local Claude Code CLI.

## Tech Stack
- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** (`@import "tailwindcss"` + `@theme` directives)
- **@anthropic-ai/claude-agent-sdk ^0.2.7** - Claude Code CLI wrapper
- **shiki** - Code syntax highlighting (github-dark theme)
- **react-markdown + remark-gfm** - Markdown rendering
- **chokidar ^5.0.0** - Real-time file change detection (SSE)
- **tree-kill ^1.2.2** - Process tree kill (Windows-compatible dev server management)
- **vitest ^3.0.0** - Unit testing framework

## Architecture

### Data Flow
```
User Input → POST /api/chat (message, sessionId, model, cwd, systemPrompt, maxTurns, maxBudgetUsd, mcpServers)
           → agent.ts: runAgent() → SDK query() call → AsyncGenerator<StreamEvent>
           → API Route: NDJSON stream response (Content-Type: application/x-ndjson)
           → Frontend: ReadableStream parsing → React state updates
```

### Directory Structure
```
src/
├── app/
│   ├── layout.tsx              # Root layout (dark theme, system font)
│   ├── page.tsx                # Main orchestrator (state management + streaming + keyboard shortcuts)
│   ├── globals.css             # Tailwind v4 + @theme dark/light theme vars + code block whitespace/word-break protection
│   └── api/
│       ├── chat/route.ts       # NDJSON streaming API (POST) - systemPrompt, maxTurns, mcpServers support
│       ├── files/route.ts      # Directory listing API (GET ?dir=)
│       ├── file-content/route.ts # File content API (GET ?path=)
│       ├── watch/route.ts      # File change detection API (SSE, chokidar)
│       ├── detect-project/route.ts # Project type detection API (GET ?dir=)
│       ├── dev-server/route.ts     # Dev Server management API (POST start/stop/status/kill-port)
│       ├── dev-server-logs/route.ts # Dev Server log SSE streaming
│       ├── scrcpy/route.ts        # ws-scrcpy management API (POST devices/connect-mumu/start/stop/status + GET SSE logs)
│       ├── upload-images/route.ts  # Image upload API (base64 → file storage, prevents localStorage overflow)
│       ├── image/route.ts         # Image serving API (GET ?path=)
│       └── download/route.ts     # File download API (GET ?path= → Content-Disposition: attachment)
├── components/
│   ├── Sidebar.tsx             # Chat history + search + export + drag reorder + inline title edit
│   ├── TopBar.tsx              # Model selector, CWD folder picker, Explorer/Preview toggle
│   ├── FolderPicker.tsx        # Folder browser dropdown
│   ├── ChatArea.tsx            # Message list + suggested prompts + pinned strip + cost display
│   ├── MessageBubble.tsx       # Individual message (markdown/code/image + copy/branch/pin buttons)
│   ├── CodeBlock.tsx           # Code block (shiki syntax highlighting + language badge + copy + whitespace-pre protection)
│   ├── MessageInput.tsx        # Input + file attach + image compression + Stop button + slash command autocomplete
│   ├── ToolBlock.tsx           # Tool execution display (smart formatting + output copy)
│   ├── PlanApprovalBlock.tsx   # Plan mode approval UI (view plan toggle + approve with feedback + permissions display)
│   ├── AskUserBlock.tsx        # Interactive question/answer UI (radio/checkbox options + Other input)
│   ├── ExplorerPanel.tsx       # File tree (left) + code preview (right) + SSE live watch + reconnect with backoff
│   ├── PreviewPanel.tsx        # Project auto-detection + Dev Server Run/Stop + logs + iframe + device mirroring (ws-scrcpy, panelMode web/device switch)
│   ├── SettingsModal.tsx       # Settings modal (Chat/MCP/Device/Defaults tabs)
│   └── Toast.tsx               # Toast notification system (ToastProvider + useToast hook)
├── lib/
│   ├── agent.ts                # SDK query() wrapper - ExitPlanMode/AskUserQuestion interception, MCP tool allowlist, Task tool support, error classification
│   ├── store.ts                # localStorage CRUD (chat + app settings, branching, export, reorder, pin, base64 image auto-stripping)
│   ├── shiki.ts                # Shiki highlighter singleton (memory-efficient, on-demand language loading)
│   ├── detect-project.ts       # Project framework detection logic (extracted for testability)
│   ├── slash-commands.ts       # Slash command definitions + parsing logic (extracted for testability)
│   ├── dev-server-manager.ts   # Dev Server process management (module-level Map, tree-kill, port occupancy detection, kill-by-port, settled flag)
│   └── scrcpy-manager.ts      # ws-scrcpy server management (globalThis HMR-safe, dist/index.js direct execution, ADB PATH auto-injection, YAML port config)
└── types/
    └── chat.ts                 # UIMessage, Chat, ChatSettings, AppSettings, McpServerConfig, StreamEvent
```

### Core Types
- **BaseMessage** = { id, timestamp, pinned? }
- **UIMessage** = UserMessage | AssistantTextMessage | ToolUseMessage | ToolResultMessage | ErrorMessage | PlanApprovalMessage | AskUserMessage
- **Chat** = { id, title, sessionId, messages, model, cwd, settings, costUsd, durationMs, branchedFrom?, order? }
- **ChatSettings** = { systemPrompt, maxTurns, maxBudgetUsd }
- **AppSettings** = { theme, mcpServers, defaultSystemPrompt, defaultMaxTurns, defaultMaxBudgetUsd, wsScrcpyPath, wsScrcpyPort }
- **McpServerConfig** = { id, name, command, args, enabled }
- **PlanApprovalMessage** = { role: "plan_approval", status, feedback?, allowedPrompts?, planContent? }
- **AskUserMessage** = { role: "ask_user", status, questions, answers? }
- **StreamEvent** = session_init | text_delta | text_done | tool_use_start | tool_use_input_delta | tool_use_done | tool_result | turn_done | plan_approval | ask_user | result | error
- **SlashCommand** = { name, description, args? }
- **ProjectInfo** = { framework, name, devCommand, defaultPort, isFlutter, flutterModes? }
- **DevServerState** = { status (stopped|starting|running|error|port_occupied), port, url, error, pid }
- **ProjectFramework** = nextjs | vite | cra | vue-cli | nuxt | angular | svelte | remix | astro | flutter | unknown
- **AdbDevice** = { id, status, model?, product? }

## Key Configuration

### next.config.ts
```ts
serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "chokidar", "tree-kill"]
```
The SDK spawns a native binary (Claude CLI), so it must be excluded from bundling.

### agent.ts Notes
- `delete process.env.CLAUDECODE` required: prevents "nested session" error when running inside Claude Code
- `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true` used
- Model mapping: opus → claude-opus-4-6, sonnet → claude-sonnet-4-6, haiku → claude-haiku-4-5-20251001
- allowedTools: Read, Edit, Write, Bash, Glob, Grep, WebSearch, WebFetch, Task (Subagent) + auto-added `mcp__<name>` patterns per MCP server
- Error classification: CLI not found, rate limit, timeout, auth failure, network error, API overloaded

### Environment Requirements
- **Claude Code CLI** must be installed (`claude --version` to verify)
- Claude Max subscription or API key configured (CLI OAuth authentication)
- Node.js (must be on PATH)
- (Optional) **ws-scrcpy** - for Android device mirroring (install at: `C:\Users\justf\ws-scrcpy`, configure path in Settings → Device)
  - Install: `git clone` → `npm install --ignore-scripts` → `npx webpack --config webpack/ws-scrcpy.prod.ts`
  - Run `dist/index.js` directly (not npm start, skips rebuild)
  - Port config: auto-generated YAML config file → `WS_SCRCPY_CONFIG` env var
- (Optional) **ADB** - for Android device connection (`adb devices` to verify, PATH auto-injected)

## Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New chat |
| `Ctrl+K` | Focus conversation search |
| `Ctrl+,` | Open/close settings modal |
| `Ctrl+E` | Toggle Explorer |
| `Ctrl+Shift+E` | Export current chat as Markdown |
| `Esc` | Close settings modal |

## Slash Commands
Type `/` in the input to show autocomplete menu. Navigate with Arrow/Tab/Enter.

| Command | Action |
|---------|--------|
| `/clear` | Clear all messages + reset session |
| `/compact [instructions]` | AI summarizes conversation → replaces messages + resets session |
| `/download <path>` | Download server file to browser (APK, ZIP, etc.) |
| `/model <opus\|sonnet\|haiku>` | Switch current chat model |
| `/usage` | Show current chat cost/message count/duration |
| `/export [md\|json]` | Export chat |
| `/help` | Show commands + shortcuts help |

## Development
```bash
npm run dev        # Start dev server at http://localhost:3000
npm run build      # Production build
npm run test       # Run all tests (vitest)
npm run test:watch # Run tests in watch mode
```

## Error Handling
- **Stream timeouts**: 10-minute total + 5-minute idle timeout
- **SSE reconnection**: Exponential backoff (1s → 16s, max 5 retries) for ExplorerPanel and PreviewPanel
- **Agent errors**: Classified into CLI not found, rate limit, timeout, auth, network, overloaded
- **API routes**: Proper HTTP status codes (404 for ENOENT, 403 for EACCES, 500 for other errors)
- **Toast notifications**: User-facing error/warning/info/success toasts (bottom-right stack, auto-dismiss)
- **Storage quota**: saveChats() returns boolean, warns user via toast when localStorage is nearly full

## Testing
- **Framework**: Vitest 3.x with `@/*` path aliases
- **70 tests** across 5 test files:
  - `src/lib/store.test.ts` (28 tests) — Chat CRUD, persistence, branching, export, title generation
  - `src/lib/detect-project.test.ts` (17 tests) — 11 framework detection + Flutter
  - `src/lib/slash-commands.test.ts` (13 tests) — Command parsing and filtering
  - `src/lib/dev-server-manager.test.ts` (6 tests) — Port utilities, server status
  - `src/app/api/download/route.test.ts` (6 tests) — File download MIME types, error handling

## Feature List
- [x] Real-time streaming chat (blinking cursor + Working indicator)
- [x] Per-chat model selection (Opus/Sonnet/Haiku, default Opus)
- [x] Per-chat working directory (folder picker)
- [x] Collapsible sidebar
- [x] File Explorer (split view + shiki syntax highlighting + SSE live file watch + reconnect with backoff)
- [x] Preview Panel (project auto-detection + Dev Server Run/Stop + live logs + iframe + port occupancy detection/Force Stop)
- [x] File attachment (clip button + drag-and-drop, `<file>` XML blocks for transmission)
- [x] Code block syntax highlighting (shiki github-dark + language badge + copy button, untagged code block detection)
- [x] Code block layout protection (ASCII art/diagram breakage prevention — break-normal + whitespace-pre enforced)
- [x] Assistant message copy button (shown on hover)
- [x] Tool execution display (smart formatting: Bash `$ cmd`, Read file path, etc. + output copy)
- [x] Empty screen suggested prompts (click to send immediately)
- [x] Draggable panel resizer
- [x] localStorage-based chat persistence
- [x] Markdown table styling
- [x] Conversation search (title + message content, Ctrl+K)
- [x] Custom system prompt (per-chat + defaults)
- [x] MCP server integration (add/remove/enable toggle)
- [x] Keyboard shortcuts (Ctrl+N/K/,/E)
- [x] Token/cost dashboard (chat footer + Sidebar)
- [x] Chat export (Markdown / JSON)
- [x] Theme settings (dark / light mode)
- [x] maxTurns / maxBudget settings
- [x] Session resumption (resume via sessionId)
- [x] Image display (Markdown image rendering)
- [x] Subagent support (Task tool)
- [x] Conversation branching (message hover → Branch button)
- [x] Device mirroring (ws-scrcpy integration, ADB device detection, MuMu Player auto-connect, iframe embed, device button on all projects)
- [x] Improved image attachment (base64 → server file storage, prevents localStorage overflow)
- [x] Slash commands (autocomplete menu + /clear, /compact, /download, /model, /usage, /export, /help)
- [x] File download (`/download <path>` for APK/ZIP etc. browser download)
- [x] Conversation compaction (`/compact` AI summary → message replacement + session reset)
- [x] Performance optimization (React.memo, shiki singleton, useCallback/useMemo stabilization — eliminates typing lag)
- [x] Toast notification system (error/warning/info/success, bottom-right stack, auto-dismiss)
- [x] Error handling improvements (stream timeouts, SSE backoff reconnect, agent error classification, API status codes)
- [x] Plan Mode UI (ExitPlanMode interception + PlanApprovalBlock + "View plan" toggle + approve with feedback + allowedPrompts display)
- [x] AskUserQuestion UI (AskUserBlock interactive question/answer + radio/checkbox + Other input)
- [x] Image compression (client-side Canvas API, max 1920px, JPEG 0.8 quality)
- [x] Sidebar drag reorder (HTML5 DnD, Chat.order field, drag handle + drop indicator)
- [x] Chat title inline editing (double-click or pencil icon, Enter/Esc/blur)
- [x] Message pin/bookmark (📌 button + PinnedStrip collapsible section + unpin)
- [x] Test suite (Vitest, 70 tests across 5 files)
- [x] Documentation (README.md + ARCHITECTURE.md)

## User Preferences
- Do not use the preview tool, run `npm run dev` directly
- Proceed autonomously without confirmation
- Communicate in Korean
