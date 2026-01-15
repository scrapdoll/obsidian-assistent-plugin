# Chat View Style Regression Tasks

## Scope
Fix UI regressions after refactor:
- Input not full width
- Buttons misaligned
- Active (auto) attachment not shown
- Attachment remove button missing

## Findings (from `src/chat/*`)
- `ChatInput` uses new class names (`assistant-chat-input-area`, `assistant-chat-attach-button`, `assistant-chat-send-button`) that are not styled in `styles.css` (still expects `assistant-chat-input-row`, `assistant-chat-attach`, `assistant-chat-send`).
- `AttachmentList` component has remove button + formatting, but `ChatInput` renders its own attachment list without remove buttons.
- `useAttachments.ensureAutoAttachment` exists but is not called in `ChatView`, so auto attachment never appears.
- Drag state uses `isDragActive` but the active class name doesn’t match CSS (`is-dragging` vs `is-drop`).

## Tasks
### 1) Restore CSS/markup parity
- [ ] Update `ChatInput` to use existing CSS class names:
  - container: `assistant-chat-input-row`
  - attach button: `assistant-chat-attach`
  - send button: `assistant-chat-send`
  - drag state: `is-drop`
- [ ] Alternatively, if new class names are preferred, add matching styles to `styles.css` and remove legacy rules.

### 2) Fix attachment list UI
- [ ] Replace inline attachments rendering in `ChatInput` with `AttachmentList`.
- [ ] Thread `onRemove` from `ChatView` to `ChatInput` (or render `AttachmentList` in `ChatView` above input).
- [ ] Ensure `AttachmentList` uses `formatBytes` and displays `active file` label for auto attachments.

### 3) Restore auto-attachment behavior
- [ ] Call `ensureAutoAttachment` on mount in `ChatView`.
- [ ] Subscribe to `app.workspace.on("file-open")` in `ChatView` and call `ensureAutoAttachment` on change.
- [ ] Ensure cleanup with `offref` on unmount.

### 4) Drag-and-drop visual state
- [ ] Align drag state class names (`is-drop`) with CSS expectations.
- [ ] Verify drop zone highlight matches original behavior.

## Verification Checklist
- [ ] Input stretches full width of the row.
- [ ] Attach/Send buttons are aligned and styled as before.
- [ ] Active file is shown as an auto attachment when a file is focused.
- [ ] Remove button appears on each attachment and removes it.
- [ ] Dragging a file highlights the input row.
