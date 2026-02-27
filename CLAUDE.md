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

## 아키텍처

### 데이터 흐름
```
User Input → POST /api/chat (message, sessionId, model, cwd)
           → agent.ts: runAgent() → SDK query() 호출 → AsyncGenerator<StreamEvent>
           → API Route: NDJSON 스트림 응답 (Content-Type: application/x-ndjson)
           → Frontend: ReadableStream 파싱 → React 상태 업데이트
```

### 디렉토리 구조
```
src/
├── app/
│   ├── layout.tsx              # 루트 레이아웃 (다크테마, Inter 폰트)
│   ├── page.tsx                # 메인 오케스트레이터 (상태관리 + 스트리밍)
│   ├── globals.css             # Tailwind v4 + @theme 커스텀 다크테마 변수
│   └── api/
│       ├── chat/route.ts       # NDJSON 스트리밍 API (POST)
│       ├── files/route.ts      # 디렉토리 목록 API (GET ?dir=)
│       ├── file-content/route.ts # 파일 내용 API (GET ?path=)
│       └── watch/route.ts      # 파일 변경 감지 API (SSE, chokidar)
├── components/
│   ├── Sidebar.tsx             # 접기/펼치기 가능한 채팅 히스토리
│   ├── TopBar.tsx              # 모델 선택, CWD 폴더피커, Explorer/Preview 토글
│   ├── FolderPicker.tsx        # 폴더 브라우저 드롭다운
│   ├── ChatArea.tsx            # 메시지 목록 + 추천 프롬프트 빈 화면 + 자동 스크롤
│   ├── MessageBubble.tsx       # 개별 메시지 (마크다운/코드 렌더링 + 복사 버튼)
│   ├── CodeBlock.tsx           # 코드블록 (shiki 구문 강조 + 언어 뱃지 + 복사)
│   ├── MessageInput.tsx        # 입력창 + 파일 첨부(클립/드래그앤드롭) + Stop 버튼
│   ├── ToolBlock.tsx           # 도구 실행 표시 (스마트 포매팅 + 출력 복사)
│   ├── ExplorerPanel.tsx       # 파일 트리(좌) + 코드 프리뷰(우) 좌우 분할
│   └── PreviewPanel.tsx        # URL 입력 + iframe
├── lib/
│   ├── agent.ts                # SDK query() 래퍼, StreamEvent 생성
│   └── store.ts                # localStorage CRUD (채팅 관리)
└── types/
    └── chat.ts                 # UIMessage 유니언 타입, Chat 인터페이스, StreamEvent
```

### 핵심 타입
- **UIMessage** = UserMessage | AssistantTextMessage | ToolUseMessage | ToolResultMessage | ErrorMessage
- **Chat** = { id, title, sessionId, messages, model, cwd, ... }
- **StreamEvent** = session_init | text_delta | text_done | tool_use_start | tool_use_done | tool_result | turn_done | result | error

## 주요 설정

### next.config.ts
```ts
serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "chokidar"]
```
SDK가 네이티브 바이너리(Claude CLI)를 spawn하므로 번들링에서 제외해야 한다.

### agent.ts 주의사항
- `delete process.env.CLAUDECODE` 필수: Claude Code 세션 내에서 실행 시 "nested session" 오류 방지
- `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true` 사용
- 모델 매핑: opus → claude-opus-4-6, sonnet → claude-sonnet-4-6, haiku → claude-haiku-4-5-20251001

### 환경 요구사항
- **Claude Code CLI** 설치 필요 (`claude --version`으로 확인)
- Claude Max 구독 또는 API 키 설정 (CLI에서 OAuth 인증)
- Node.js (PATH에 등록 필요)

## 개발 서버
```bash
npm run dev
# http://localhost:3000
```

## 기능 목록
- [x] 실시간 스트리밍 채팅 (블링킹 커서 인디케이터)
- [x] 채팅별 모델 선택 (Opus/Sonnet/Haiku, 기본 Opus)
- [x] 채팅별 작업 디렉토리 (폴더 피커)
- [x] 접기/펼치기 사이드바
- [x] 파일 탐색기 (좌우 분할 + shiki 구문 강조, 기본 열림)
- [x] 프리뷰 패널 (iframe)
- [x] 파일 첨부 (클립 버튼 + 드래그앤드롭, `<file>` XML 블록으로 전송)
- [x] 코드블록 구문 강조 (shiki github-dark + 언어 뱃지 + 복사 버튼)
- [x] 어시스턴트 메시지 복사 버튼 (hover 표시)
- [x] 도구 실행 표시 (스마트 포매팅: Bash `$ cmd`, Read 파일경로 등 + 출력 복사)
- [x] 빈 화면 추천 프롬프트 (클릭 시 바로 전송)
- [x] 드래그 가능한 패널 리사이저
- [x] localStorage 기반 채팅 저장
- [x] 마크다운 테이블 스타일링

## 유저 선호
- preview 툴 사용 금지, `npm run dev`로 직접 실행
- 확인 없이 자율적으로 진행
- 한국어 소통
