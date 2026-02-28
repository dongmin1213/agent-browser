# Architecture

## Data Flow

```
User Input
  → POST /api/chat (message, sessionId, model, cwd, systemPrompt, maxTurns, mcpServers)
  → agent.ts: runAgent() → SDK query() → AsyncGenerator<StreamEvent>
  → API Route: NDJSON stream response (Content-Type: application/x-ndjson)
  → Frontend: ReadableStream parsing → React state updates
```

## Directory Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout (dark theme, system font)
│   ├── page.tsx                      # Main orchestrator (state, streaming, shortcuts)
│   ├── globals.css                   # Tailwind v4 + @theme dark/light variables
│   └── api/
│       ├── chat/route.ts             # NDJSON streaming API (POST)
│       ├── files/route.ts            # Directory listing (GET ?dir=)
│       ├── file-content/route.ts     # File content (GET ?path=)
│       ├── watch/route.ts            # File change detection (SSE, chokidar)
│       ├── detect-project/route.ts   # Project type detection (GET ?dir=)
│       ├── dev-server/route.ts       # Dev server management (POST)
│       ├── dev-server-logs/route.ts  # Dev server log streaming (SSE)
│       ├── scrcpy/route.ts           # ws-scrcpy management (POST + SSE)
│       ├── upload-images/route.ts    # Image upload (base64 → file)
│       ├── image/route.ts            # Image serving (GET ?path=)
│       └── download/route.ts         # File download (GET ?path=)
├── components/
│   ├── Sidebar.tsx           # Chat history + search + export + drag reorder + inline title edit
│   ├── TopBar.tsx            # Model selector, CWD picker, panel toggles
│   ├── FolderPicker.tsx      # Folder browser dropdown
│   ├── ChatArea.tsx          # Message list + suggested prompts + pinned strip + cost display
│   ├── MessageBubble.tsx     # Individual message (markdown/code/images + pin/branch buttons)
│   ├── CodeBlock.tsx         # Code block (Shiki highlighting + copy)
│   ├── MessageInput.tsx      # Input + file attach + image compression + slash command autocomplete
│   ├── ToolBlock.tsx         # Tool execution display (smart formatting)
│   ├── PlanApprovalBlock.tsx # Plan mode approval UI (view plan + approve with feedback + permissions)
│   ├── AskUserBlock.tsx      # Interactive question/answer UI (radio/checkbox + Other input)
│   ├── ExplorerPanel.tsx     # File tree + code preview + SSE live refresh
│   ├── PreviewPanel.tsx      # Project detection + dev server + iframe + device mirror
│   ├── SettingsModal.tsx     # Settings (Chat/MCP/Device/Defaults tabs)
│   └── Toast.tsx             # Toast notification system (provider + hook)
├── lib/
│   ├── agent.ts              # SDK query() wrapper with error classification + ExitPlanMode/AskUserQuestion interception
│   ├── store.ts              # localStorage CRUD (chats + app settings + reorder + pin)
│   ├── shiki.ts              # Shiki highlighter singleton (on-demand language loading)
│   ├── detect-project.ts     # Project framework detection logic
│   ├── slash-commands.ts     # Slash command definitions + parsing
│   ├── dev-server-manager.ts # Dev server process management
│   └── scrcpy-manager.ts     # ws-scrcpy server management
└── types/
    └── chat.ts               # All TypeScript interfaces and types
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Stream chat response (NDJSON) |
| GET | `/api/files?dir=` | List directory contents |
| GET | `/api/file-content?path=` | Read file content + language |
| GET | `/api/watch?dir=` | SSE file change notifications |
| GET | `/api/detect-project?dir=` | Detect project framework |
| POST | `/api/dev-server` | Start/stop/status/kill-port dev server |
| GET | `/api/dev-server-logs?cwd=` | SSE dev server log stream |
| POST/GET | `/api/scrcpy` | ws-scrcpy management + SSE logs |
| POST | `/api/upload-images` | Upload base64 images to server |
| GET | `/api/image?path=` | Serve image file |
| GET | `/api/download?path=` | Download file (Content-Disposition: attachment) |

## Stream Event Protocol

The chat API uses NDJSON (newline-delimited JSON) streaming. Each line is one event:

```typescript
type StreamEvent =
  | { type: "session_init"; sessionId: string }
  | { type: "text_delta"; text: string }
  | { type: "text_done" }
  | { type: "tool_use_start"; toolName: string; toolUseId: string }
  | { type: "tool_use_input_delta"; partialJson: string }
  | { type: "tool_use_done"; toolUseId: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError: boolean }
  | { type: "turn_done" }
  | { type: "plan_approval"; allowedPrompts?: { tool: string; prompt: string }[]; planContent?: string }
  | { type: "ask_user"; questions: AskUserQuestion[] }
  | { type: "result"; result: string; costUsd?: number; durationMs?: number }
  | { type: "error"; message: string }
```

## Key Design Decisions

### Agent SDK Integration
- `delete process.env.CLAUDECODE` prevents "nested session" errors when running inside Claude Code
- `permissionMode: "bypassPermissions"` enables autonomous tool execution
- `includePartialMessages: true` enables real token-level streaming

### State Management
- All state lives in React useState (no external state library)
- Chat persistence via localStorage with base64 image stripping to prevent quota overflow
- Per-chat abort controllers for independent stream cancellation

### SSE Reconnection
- ExplorerPanel and PreviewPanel use exponential backoff (1s → 16s, max 5 retries)
- Visual status indicators for connection state

### Plan Mode & AskUserQuestion
- agent.ts intercepts `ExitPlanMode` and `AskUserQuestion` tool calls from the SDK
- Suppresses these tools from the stream, captures input buffers (allowedPrompts, questions)
- Yields custom `plan_approval` / `ask_user` events with captured data
- `currentAssistantText` preserved (not reset on turn_done) to pass plan content to frontend
- PlanApprovalBlock: collapsible "View plan" toggle, approve with feedback, permissions display
- AskUserBlock: interactive radio/checkbox options, "Other" free text, submit button

### Error Handling
- Stream timeouts: 10-minute total + 5-minute idle
- Agent errors classified: CLI not found, rate limit, auth failure, network, overloaded
- API routes return proper HTTP status codes (404, 403, 500)
- Toast notification system for user-facing errors

### Performance
- React.memo on heavy components (ChatArea, ExplorerPanel, PreviewPanel, Sidebar, etc.)
- Shiki highlighter singleton with on-demand language loading
- useCallback/useMemo to prevent unnecessary re-renders

### Dev Server Management
- Module-level Map tracks running processes across API requests
- tree-kill for Windows-compatible process tree termination
- Port occupancy detection with PID lookup and force-kill capability
- `settled` flag prevents race conditions in ready/error detection

## Testing

Tests use **Vitest** with path aliases matching the Next.js `@/*` convention.

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

Test files:
- `src/lib/store.test.ts` — Chat CRUD, persistence, export, branching
- `src/lib/detect-project.test.ts` — Framework detection for 11 frameworks
- `src/lib/slash-commands.test.ts` — Command parsing and filtering
- `src/lib/dev-server-manager.test.ts` — Port utilities, server lifecycle
- `src/app/api/download/route.test.ts` — File download API
