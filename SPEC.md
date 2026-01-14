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
- `specs/attach-node-to-message/SPEC.md` defines the file attachment feature,
  including auto-attaching the active editor file and how attachments are
  encoded in the ACP prompt payload.

## 3. User Flows
1. User clicks ribbon icon to open the assistant view.
2. Plugin initializes ACP client and session.
3. User sends a prompt; assistant responses stream into the chat view.
4. ACP tool calls and updates are shown as system messages.
5. If ACP requests permission, the user selects an option or cancels.

## 4. Functional Requirements
FR-1: The plugin registers a custom view type named `example-view`.
FR-2: A ribbon icon opens the assistant view and initializes the ACP client.
FR-3: The chat view shows status: Connecting, Ready, Generating, Disconnected.
FR-4: Sending a prompt appends a user message and triggers ACP `prompt`.
FR-5: Assistant message streaming appends text chunks to the active message.
FR-6: ACP session updates display system messages for tool calls, mode changes,
      and other session events.
FR-7: Permission requests are queued; the UI displays the active request and
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
NFR-2: Errors are surfaced to the user in the chat view and logged to console.
NFR-3: The plugin does not perform network requests by default.
NFR-4: File access is limited to the current vault.
NFR-5: Desktop-only behavior is required due to `child_process` usage.

## 6. Architecture
Entry point and lifecycle:
- `src/main.ts` registers the view, settings tab, and ribbon icon.

ACP integration:
- `src/acp/client.ts` spawns the ACP process, manages sessions, and implements
  ACP client methods including vault file operations.

UI:
- `src/chatView.tsx` renders the chat UI, handles streaming updates, and manages
  permission prompts.
- `styles.css` provides layout and visual styling.

Settings:
- `src/settings.ts` defines a simple settings schema and settings tab.

Build:
- `esbuild.config.mjs` bundles `src/main.ts` into `build/main.js`.

## 7. Data and State
Chat view state:
- `messages`: list of chat and system messages.
- `status`: connection status.
- `permissionQueue`: pending permission requests.

ACP client state:
- `connection`, `sessionId`, `initializationPromise`, `sessionPromise`.

Settings:
- `mySetting`: simple string stored in plugin data.

## 8. Error Handling
- Connection and prompt errors are formatted and displayed in the UI.
- Permission handler errors fall back to cancelling the request.
- ACP process errors reset client state.

## 9. Security and Privacy
- No telemetry or network calls by default.
- Vault path traversal is blocked.
- ACP tool permissions require explicit user selection.

## 10. Future Roadmap (from TASKS.md)
- Minimalist chat UI styling inspired by ChatGPT/Manus.
- Agent selection and per-agent configuration.
- Slash commands and skills (if supported by the agent).
- RAG support.
