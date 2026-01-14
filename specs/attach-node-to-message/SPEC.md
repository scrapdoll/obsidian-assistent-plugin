# Attach Node To Message - Specification

## 1. Overview
Add support for attaching vault files ("nodes") to chat messages in the Obsidian
assistant view. Attachments can be added manually or auto-attached when a file
is active in the editor. The user can review and remove attachments before
sending.

## 2. Goals
- Allow attaching files to provide context to the agent.
- Support both inline content (for small text files) and reference-only mode.
- Auto-attach the currently active editor file when composing a message.
- Keep the experience safe, local, and reversible.

## 3. Non-Goals
- Uploading files outside the vault.
- Background syncing, indexing, or RAG.
- Binary file content streaming.

## 4. User Flows
1. User opens the assistant chat view.
2. If a file tab is active, it is automatically added as a pending attachment.
3. User may add more files via an Attach button or drag-and-drop.
4. User can remove any attachment before sending.
5. User sends the message; attachments are included in the prompt payload.

## 5. Functional Requirements
FR-1: The chat composer shows an Attach control and an attachments list.
FR-2: The active editor file is auto-attached when composing a new message.
FR-3: Auto-attached files are removable before send.
FR-4: Attachments include metadata: vault-relative path, name, size, kind.
FR-5: Text attachments may be sent inline if under size limit.
FR-6: Binary or large files are sent as references only.
FR-7: If a file is missing at send time, show an error and skip it.
FR-8: Sending clears the attachment list for the next message.

## 6. Data Model
```ts
type Attachment = {
  id: string;
  path: string;   // vault-relative
  name: string;
  size: number;
  kind: "text" | "binary";
  mode: "inline" | "reference";
  content?: string; // set only for inline text
  source: "auto" | "manual";
};
```

## 7. UI Requirements
- Composer area shows attachments as removable chips.
- Auto-attached files are visually marked (e.g., "Active file").
- If inline content is truncated or too large, show a warning.
- Drag-and-drop highlights the drop zone.

## 8. ACP Integration
- Extend `sendPrompt` to accept `ContentBlock[]`.
- For inline text attachments:
  - Add `resource` blocks with `text` content.
- For reference-only attachments:
  - Add `resource_link` blocks with vault URI and file name.
- Maintain the original user prompt as the first `text` block.

## 9. Constraints
- Enforce a max inline size (e.g., 200-400 KB) configurable later.
- Only allow files inside the current vault.
- No network usage for attachment handling.

## 10. Error Handling
- Missing or unreadable file: show a system message and exclude it.
- Unsupported file type: fallback to reference mode.
- Read failures should not block sending the text message.

## 11. Security and Privacy
- Attachments are local and user-initiated.
- Auto-attach is visible and removable to prevent hidden data sharing.
- Do not send vault content unless the user confirms by sending.

## 12. Acceptance Criteria
- User can attach and remove files before sending.
- Active file auto-attaches when present, and can be removed.
- Small text files are sent inline; large/binary files are sent as references.
- Sending works even if some attachments fail to load.
