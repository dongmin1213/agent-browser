# Agent Browser

A web-based **Claude Desktop** clone powered by the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk). Access Claude's agentic capabilities — file system operations, code execution, web search, and more — through a modern web interface.

![Tech Stack](https://img.shields.io/badge/Next.js_15-black?style=flat&logo=nextdotjs) ![React 19](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)

## Features

- **Real-time streaming chat** with blinking cursor and activity indicators
- **Per-chat model selection** — Opus / Sonnet / Haiku
- **Per-chat working directory** with folder picker
- **File Explorer** — tree view + syntax-highlighted preview + live file watching (SSE)
- **Preview Panel** — auto-detect project framework, run/stop dev server, live logs, iframe preview
- **Tool execution display** — smart formatting for Bash, Read, Write, etc.
- **Code blocks** — Shiki syntax highlighting (github-dark), language badges, copy button
- **Image support** — paste, drag & drop, clipboard upload (server-side storage, client-side compression)
- **Slash commands** — `/clear`, `/compact`, `/download`, `/model`, `/usage`, `/export`, `/help`
- **MCP server integration** — add/remove/toggle MCP servers (e.g., Playwright)
- **Conversation branching** — branch from any message
- **Plan Mode** — interactive plan approval with "View plan" toggle, approve with feedback, permissions display
- **AskUserQuestion** — interactive question/answer UI with radio/checkbox options
- **Sidebar drag reorder** — drag & drop to rearrange chat order
- **Inline chat title editing** — double-click or pencil icon to rename
- **Message pin/bookmark** — pin important messages, collapsible pinned strip at top
- **Device mirroring** — Android screen mirroring via ws-scrcpy
- **Dark / Light theme**
- **Keyboard shortcuts** — Ctrl+N, Ctrl+K, Ctrl+E, Ctrl+,, Ctrl+Shift+E
- **Session persistence** — localStorage-based chat history with resume support
- **Cost tracking** — per-chat token usage and cost display

## Quick Start

### Prerequisites

- **Node.js** 18+ (with npm)
- **Claude Code CLI** installed and authenticated
  ```bash
  # Install Claude Code CLI
  npm install -g @anthropic-ai/claude-code
  # Authenticate (opens browser)
  claude
  ```

### Install & Run

```bash
git clone https://github.com/dongmin1213/agent-browser.git
cd agent-browser
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Optional: Device Mirroring

For Android device mirroring via ws-scrcpy:

1. Clone and build ws-scrcpy:
   ```bash
   git clone https://nicedoc.io/nicedoc/nicedoc.io ws-scrcpy
   cd ws-scrcpy
   npm install --ignore-scripts
   npx webpack --config webpack/ws-scrcpy.prod.ts
   ```
2. Go to **Settings > Device** tab and set the ws-scrcpy path
3. Connect your Android device/emulator via ADB

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Agent SDK | @anthropic-ai/claude-agent-sdk |
| Syntax Highlighting | Shiki (github-dark theme) |
| Markdown | react-markdown + remark-gfm |
| File Watching | chokidar |
| Process Management | tree-kill |
| Testing | Vitest |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New chat |
| `Ctrl+K` | Search conversations |
| `Ctrl+,` | Open/close settings |
| `Ctrl+E` | Toggle Explorer panel |
| `Ctrl+Shift+E` | Export current chat as Markdown |
| `Esc` | Close settings modal |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/clear` | Clear all messages in current chat |
| `/compact [instructions]` | AI-summarize conversation |
| `/download <path>` | Download a server file |
| `/model <opus\|sonnet\|haiku>` | Switch model |
| `/usage` | Show token usage and cost |
| `/export [md\|json]` | Export chat |
| `/help` | Show help |

## Scripts

```bash
npm run dev        # Start development server
npm run build      # Production build
npm run start      # Start production server
npm run test       # Run tests
npm run test:watch # Run tests in watch mode
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical documentation.

## License

MIT
