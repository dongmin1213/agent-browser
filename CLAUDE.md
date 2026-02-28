# Agent Browser - Claude Desktop Web Clone

## 프로젝트 개요
Claude Agent SDK(`@anthropic-ai/claude-agent-sdk`)를 사용한 웹 기반 Claude Desktop 클론.
로컬 머신의 Claude Code CLI를 통해 파일 시스템 접근, Bash 실행 등 에이전트 기능을 웹 UI로 제공한다.

## 기술 스택
- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** (`@import "tailwindcss"` + `@theme` 디렉티브)
- **@anthropic-ai/claude-agent-sdk ^0.2.7** - Claude Code CLI 래퍼
- **shiki** - 코드 구문 강조 (github-dark 테마)
- **react-markdown + remark-gfm** - 마크다운 렌더링
- **chokidar ^5.0.0** - 파일 변경 실시간 감지 (SSE)
- **tree-kill ^1.2.2** - 프로세스 트리 kill (Windows 호환 dev server 관리)

## 아키텍처

### 데이터 흐름
```
User Input → POST /api/chat (message, sessionId, model, cwd, systemPrompt, maxTurns, maxBudgetUsd, mcpServers)
           → agent.ts: runAgent() → SDK query() 호출 → AsyncGenerator<StreamEvent>
           → API Route: NDJSON 스트림 응답 (Content-Type: application/x-ndjson)
           → Frontend: ReadableStream 파싱 → React 상태 업데이트
```

### 디렉토리 구조
```
src/
├── app/
│   ├── layout.tsx              # 루트 레이아웃 (다크테마, Inter 폰트)
│   ├── page.tsx                # 메인 오케스트레이터 (상태관리 + 스트리밍 + 키보드 단축키)
│   ├── globals.css             # Tailwind v4 + @theme 다크/라이트 테마 변수 + 코드블록 whitespace/word-break 보호
│   └── api/
│       ├── chat/route.ts       # NDJSON 스트리밍 API (POST) - systemPrompt, maxTurns, mcpServers 지원
│       ├── files/route.ts      # 디렉토리 목록 API (GET ?dir=)
│       ├── file-content/route.ts # 파일 내용 API (GET ?path=)
│       ├── watch/route.ts      # 파일 변경 감지 API (SSE, chokidar)
│       ├── detect-project/route.ts # 프로젝트 타입 감지 API (GET ?dir=)
│       ├── dev-server/route.ts     # Dev Server 관리 API (POST start/stop/status/kill-port)
│       ├── dev-server-logs/route.ts # Dev Server 로그 SSE 스트리밍
│       ├── scrcpy/route.ts        # ws-scrcpy 관리 API (POST devices/connect-mumu/start/stop/status + GET SSE 로그)
│       ├── upload-images/route.ts  # 이미지 업로드 API (base64 → 파일 저장, localStorage 오버플로 방지)
│       ├── image/route.ts         # 이미지 서빙 API (GET ?path=)
│       └── download/route.ts     # 파일 다운로드 API (GET ?path= → Content-Disposition: attachment)
├── components/
│   ├── Sidebar.tsx             # 접기/펼치기 채팅 히스토리 + 검색 + 내보내기 + Settings 버튼
│   ├── TopBar.tsx              # 모델 선택, CWD 폴더피커, Explorer/Preview 토글
│   ├── FolderPicker.tsx        # 폴더 브라우저 드롭다운
│   ├── ChatArea.tsx            # 메시지 목록 + 추천 프롬프트 + 비용 표시 + Working 인디케이터
│   ├── MessageBubble.tsx       # 개별 메시지 (마크다운/코드/이미지 렌더링 + 복사/브랜치 버튼, 언어 미지정 코드블록 감지)
│   ├── CodeBlock.tsx           # 코드블록 (shiki 구문 강조 + 언어 뱃지 + 복사 + whitespace-pre 보호)
│   ├── MessageInput.tsx        # 입력창 + 파일 첨부(클립/드래그앤드롭) + Stop 버튼 + 슬래시 명령어 자동완성
│   ├── ToolBlock.tsx           # 도구 실행 표시 (스마트 포매팅 + 출력 복사)
│   ├── ExplorerPanel.tsx       # 파일 트리(좌) + 코드 프리뷰(우) + SSE 실시간 감시
│   ├── PreviewPanel.tsx        # 프로젝트 자동 감지 + Dev Server Run/Stop + 로그 + iframe + 디바이스 미러링(ws-scrcpy, panelMode web/device 전환)
│   └── SettingsModal.tsx       # 설정 모달 (Chat/MCP/Device/Defaults 탭)
├── lib/
│   ├── agent.ts                # SDK query() 래퍼 - systemPrompt, maxTurns, maxBudgetUsd, mcpServers, MCP 도구 허용, Task 도구 지원
│   ├── store.ts                # localStorage CRUD (채팅 + 앱설정 관리, 브랜칭, 내보내기, base64 이미지 자동 스트리핑)
│   ├── shiki.ts                # shiki 하이라이터 싱글톤 (메모리 절약, 언어 온디맨드 로딩)
│   ├── dev-server-manager.ts   # Dev Server 프로세스 관리 (module-level Map, tree-kill, 포트 점유 감지, kill-by-port)
│   └── scrcpy-manager.ts      # ws-scrcpy 서버 관리 (globalThis HMR-safe, dist/index.js 직접 실행, ADB PATH 자동 주입, YAML 포트 설정)
└── types/
    └── chat.ts                 # UIMessage, Chat, ChatSettings, AppSettings, McpServerConfig, StreamEvent
```

### 핵심 타입
- **UIMessage** = UserMessage | AssistantTextMessage | ToolUseMessage | ToolResultMessage | ErrorMessage | PlanApprovalMessage
- **Chat** = { id, title, sessionId, messages, model, cwd, settings, costUsd, durationMs, branchedFrom? }
- **ChatSettings** = { systemPrompt, maxTurns, maxBudgetUsd }
- **AppSettings** = { theme, mcpServers, defaultSystemPrompt, defaultMaxTurns, defaultMaxBudgetUsd, wsScrcpyPath, wsScrcpyPort }
- **McpServerConfig** = { id, name, command, args, enabled }
- **StreamEvent** = session_init | text_delta | text_done | tool_use_start | tool_use_input_delta | tool_use_done | tool_result | turn_done | plan_approval | result | error
- **SlashCommand** = { name, description, args? }
- **ProjectInfo** = { framework, name, devCommand, defaultPort, isFlutter, flutterModes? }
- **DevServerState** = { status (stopped|starting|running|error|port_occupied), port, url, error, pid }
- **ProjectFramework** = nextjs | vite | cra | vue-cli | nuxt | angular | svelte | remix | astro | flutter | unknown
- **AdbDevice** = { id, status, model?, product? }

## 주요 설정

### next.config.ts
```ts
serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "chokidar", "tree-kill"]
```
SDK가 네이티브 바이너리(Claude CLI)를 spawn하므로 번들링에서 제외해야 한다.

### agent.ts 주의사항
- `delete process.env.CLAUDECODE` 필수: Claude Code 세션 내에서 실행 시 "nested session" 오류 방지
- `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true` 사용
- 모델 매핑: opus → claude-opus-4-6, sonnet → claude-sonnet-4-6, haiku → claude-haiku-4-5-20251001
- allowedTools: Read, Edit, Write, Bash, Glob, Grep, WebSearch, WebFetch, Task (Subagent) + MCP 서버별 `mcp__<name>` 패턴 자동 추가

### 환경 요구사항
- **Claude Code CLI** 설치 필요 (`claude --version`으로 확인)
- Claude Max 구독 또는 API 키 설정 (CLI에서 OAuth 인증)
- Node.js (PATH에 등록 필요)
- (선택) **ws-scrcpy** - Android 디바이스 미러링용 (설치: `C:\Users\justf\ws-scrcpy`, Settings → Device에서 경로 설정)
  - 설치: `git clone` → `npm install --ignore-scripts` → `npx webpack --config webpack/ws-scrcpy.prod.ts`
  - `dist/index.js` 직접 실행 (npm start 아닌 직접 node 실행, 빌드 스킵)
  - 포트 설정: YAML 설정파일 자동 생성 → `WS_SCRCPY_CONFIG` 환경변수
- (선택) **ADB** - Android 디바이스 연결용 (`adb devices`로 확인, PATH 자동 주입됨)

## 키보드 단축키
| 단축키 | 동작 |
|--------|------|
| `Ctrl+N` | 새 채팅 |
| `Ctrl+K` | 대화 검색 포커스 |
| `Ctrl+,` | 설정 모달 열기/닫기 |
| `Ctrl+E` | Explorer 토글 |
| `Ctrl+Shift+E` | 현재 채팅 Markdown 내보내기 |
| `Esc` | 설정 모달 닫기 |

## 슬래시 명령어
입력창에 `/` 입력 시 자동완성 메뉴 표시. 화살표/Tab/Enter로 선택.

| 명령어 | 동작 |
|--------|------|
| `/clear` | 현재 채팅 메시지 전부 삭제 + 세션 초기화 |
| `/compact [지시]` | AI가 대화 요약 → 기존 메시지를 요약본으로 교체 + 세션 리셋 |
| `/download <경로>` | 서버의 파일을 브라우저로 다운로드 (APK, ZIP 등) |
| `/model <opus\|sonnet\|haiku>` | 현재 채팅 모델 전환 |
| `/usage` | 현재 채팅 비용/메시지 수/시간 표시 |
| `/export [md\|json]` | 채팅 내보내기 |
| `/help` | 명령어 + 단축키 도움말 |

## 개발 서버
```bash
npm run dev
# http://localhost:3000
```

## 기능 목록
- [x] 실시간 스트리밍 채팅 (블링킹 커서 + Working 인디케이터)
- [x] 채팅별 모델 선택 (Opus/Sonnet/Haiku, 기본 Opus)
- [x] 채팅별 작업 디렉토리 (폴더 피커)
- [x] 접기/펼치기 사이드바
- [x] 파일 탐색기 (좌우 분할 + shiki 구문 강조 + SSE 실시간 파일 감시)
- [x] 프리뷰 패널 (프로젝트 자동 감지 + Dev Server Run/Stop + 실시간 로그 + iframe + 포트 점유 감지/Force Stop)
- [x] 파일 첨부 (클립 버튼 + 드래그앤드롭, `<file>` XML 블록으로 전송)
- [x] 코드블록 구문 강조 (shiki github-dark + 언어 뱃지 + 복사 버튼, 언어 미지정 코드블록도 정상 감지)
- [x] 코드블록 레이아웃 보호 (ASCII art/다이어그램 깨짐 방지 — break-normal + whitespace-pre 강제)
- [x] 어시스턴트 메시지 복사 버튼 (hover 표시)
- [x] 도구 실행 표시 (스마트 포매팅: Bash `$ cmd`, Read 파일경로 등 + 출력 복사)
- [x] 빈 화면 추천 프롬프트 (클릭 시 바로 전송)
- [x] 드래그 가능한 패널 리사이저
- [x] localStorage 기반 채팅 저장
- [x] 마크다운 테이블 스타일링
- [x] 대화 검색 (제목 + 메시지 내용, Ctrl+K)
- [x] 시스템 프롬프트 커스텀 (채팅별 + 기본값)
- [x] MCP 서버 연동 (추가/삭제/활성화 토글)
- [x] 키보드 단축키 (Ctrl+N/K/,/E)
- [x] 토큰/비용 대시보드 (채팅 하단 + Sidebar)
- [x] 대화 내보내기 (Markdown / JSON)
- [x] 테마 설정 (다크 / 라이트 모드)
- [x] maxTurns / maxBudget 설정
- [x] 세션 이어하기 (resume, sessionId 기반)
- [x] 이미지 표시 (Markdown 이미지 렌더링)
- [x] Subagent 지원 (Task 도구)
- [x] 대화 브랜칭 (메시지 hover → Branch 버튼)
- [x] 디바이스 미러링 (ws-scrcpy 연동, ADB 디바이스 감지, MuMu Player 자동 연결, iframe 임베드, 모든 프로젝트에서 📱 버튼으로 전환)
- [x] 이미지 첨부 개선 (base64 → 서버 파일 저장, localStorage 오버플로 방지)
- [x] 슬래시 명령어 (자동완성 메뉴 + /clear, /compact, /download, /model, /usage, /export, /help)
- [x] 파일 다운로드 (`/download <경로>`로 APK/ZIP 등 브라우저 다운로드)
- [x] 대화 압축 (`/compact`로 AI 요약 → 메시지 교체 + 세션 리셋)
- [x] 성능 최적화 (React.memo 적용, shiki 싱글톤, useCallback/useMemo 안정화 — 타이핑 랙 해소)

## 유저 선호
- preview 툴 사용 금지, `npm run dev`로 직접 실행
- 확인 없이 자율적으로 진행
- 한국어 소통
