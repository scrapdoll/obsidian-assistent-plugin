# Obsidian Assistant Plugin Specification

## 1. Overview
This project is an Obsidian community plugin that provides a chat-style UI and
connects to an external Agent Client Protocol (ACP) process over stdio. The
plugin streams assistant responses, surfaces tool activity, and supports vault
file read/write operations through ACP.

## 2. Scope
In scope:
- Chat view embedded in Obsidian with message streaming.
- ACP client lifecycle: spawn, initialize, create session, send prompts.
- Permission request UI for ACP tool calls.
- Vault file read/write capabilities exposed to ACP tools.

Out of scope (current implementation):
- Terminal tool support.
- Slash commands and skills.
- Retrieval-augmented generation (RAG).
- Cloud services or external network calls.

## Related Specs
- `specs/chat-view-refactoring/SPEC.md` defines the modular architecture for the chat UI,
  including hooks, components, and type safety improvements.
- `specs/attach-node-to-message/SPEC.md` defines file attachment feature,
  including auto-attaching active editor file and how attachments are
  encoded in ACP prompt payload.

## 3. User Flows
1. User clicks ribbon icon to open assistant view.
2. Plugin initializes ACP client and session.
3. User sends a prompt; assistant responses stream into chat view.
4. ACP tool calls and updates are shown as system messages.
5. If ACP requests permission, user selects an option or cancels.

## 4. Functional Requirements
FR-1: The plugin registers a custom view type named `example-view`.
FR-2: A ribbon icon opens assistant view and initializes ACP client.
FR-3: The chat view shows status: Connecting, Ready, Generating, Disconnected.
FR-4: Sending a prompt appends a user message and triggers ACP `prompt`.
FR-5: Assistant message streaming appends text chunks to active message.
FR-6: ACP session updates display system messages for tool calls, mode changes,
      and other session events.
FR-7: Permission requests are queued; UI displays the active request and
      allows selecting an option or canceling.
FR-8: ACP client spawns `claude-code-acp` and connects via NDJSON over stdio.
FR-9: ACP file tools are implemented:
      - `readTextFile` reads from the Obsidian vault.
      - `writeTextFile` writes to the Obsidian vault, creating parent folders.
FR-10: Path safety is enforced:
       - Reject path traversal using `..`.
       - Reject absolute paths outside the vault.
FR-11: Terminal ACP methods return `methodNotFound` (unsupported).
FR-12: Plugin settings are persisted via `loadData` and `saveData`.
FR-13: ACP process is terminated on plugin unload and on app quit.

## 5. Non-Functional Requirements
NFR-1: Startup is light; ACP session is created lazily when the view mounts.
NFR-2: Errors are surfaced to the user in the chat view and logged to the console.
NFR-3: The plugin does not perform network requests by default.
NFR-4: File access is limited to the current vault.
NFR-5: Desktop-only behavior is required due to `child_process` usage.
NFR-6: The chat UI follows React best practices with proper state management,
       type safety (strict mode enabled), and accessibility (ARIA attributes).

## 6. Architecture
### Entry point and lifecycle
- `src/main.ts` registers the view, settings tab, and ribbon icon.
- `src/settings.ts` defines a simple settings schema and settings tab.

### ACP integration
- `src/acp/client.ts` spawns the ACP process, manages sessions, and implements
  ACP client methods including vault file operations.

### Chat UI (refactored modular architecture)
- `src/chat/` directory contains the chat view implementation with the following structure:

```
src/chat/
├── types/
│   └── index.ts           # Shared type definitions (ChatMessage, Attachment, etc.)
├── constants/
│   └── index.ts           # Constants (INLINE_ATTACHMENT_LIMIT, TEXT_EXTENSIONS)
├── utils/
│   ├── idGenerator.ts      # Message ID generation
│   ├── formatters.ts       # Error/formatting utilities
│   ├── paths.ts           # Path resolution utilities
│   ├── content.ts         # Content transformation
│   ├── fileDetection.ts   # File type detection
│   └── validators.ts      # Type guards
├── hooks/
│   ├── useMessages.ts      # Message state and operations
│   ├── usePermissions.ts   # Permission queue handling
│   ├── useAttachments.ts   # Attachment management
│   ├── useDragDrop.ts      # Drag and drop handlers
│   └── useKeyboardShortcuts.ts # Keyboard shortcuts
├── components/
│   ├── ChatHeader.tsx      # Status header
│   ├── ChatMessages.tsx    # Message list container
│   ├── ChatMessage.tsx     # Individual message
│   ├── PermissionPrompt.tsx # Permission request UI
│   ├── AttachmentList.tsx   # Attached files list
│   ├── AttachmentItem.tsx   # Single attachment
│   ├── ChatInput.tsx       # Input area
│   ├── ChatError.tsx       # Error display
│   └── index.ts           # Component exports
├── ChatView.tsx           # Main orchestrator component
└── index.ts               # Barrel exports
```

- `src/chatView.tsx` remains as the Obsidian ItemView wrapper but delegates
  to the modular `src/chat/ChatView.tsx` implementation.
- `styles.css` provides layout and visual styling.

### Build
- `esbuild.config.mjs` bundles `src/main.ts` into `build/main.js`.

## 7. Data and State
### Chat view state (managed via hooks)
- `messages`: list of chat and system messages.
- `status`: connection status (connecting, ready, error).
- `permissionQueue`: pending permission requests.
- `attachments`: list of attached files (inline or reference).
- `isDragActive`: drag and drop state.
- `input`: user input text.
- `isSending`: message sending state.
- `error`: current error message.

### ACP client state
- `connection`, `sessionId`, `initializationPromise`, `sessionPromise`.

### Settings
- `mySetting`: simple string stored in plugin data.

## 8. Error Handling
- Connection and prompt errors are formatted and displayed in the UI.
- Permission handler errors fall back to canceling the request.
- ACP process errors reset client state.
- Type guards and discriminated unions prevent runtime type errors.

## 9. Security and Privacy
- No telemetry or network calls by default.
- Vault path traversal is blocked.
- ACP tool permissions require explicit user selection.
- User data stays within the vault; attachments are either inline (for small text files)
  or by reference (for larger files).

## 10. Accessibility
- Semantic HTML elements (`header`, `section`, `article`, `ul`, `li`).
- ARIA labels and roles for interactive elements.
- `aria-live` regions for dynamic content (status, errors).
- Focus management (restores focus to input after send and permission actions).
- Keyboard shortcuts (Enter to send, Shift+Enter for newline).

## 11. Future Roadmap (from TASKS.md)
- Minimalist chat UI styling inspired by ChatGPT/Manus.
- Agent selection and per-agent configuration.
- Slash commands and skills (if supported by the agent).
- RAG support.
- List virtualization for large message histories (if profiling shows need).
