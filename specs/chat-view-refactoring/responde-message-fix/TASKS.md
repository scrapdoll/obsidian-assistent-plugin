# Chat View Response Message Merge Regression Tasks

## Symptom
New assistant responses append to the first assistant message instead of creating a new message block.

## Findings (from `src/chat/*`)
- `useMessages.appendAssistantText` appends to `activeAssistantIdRef` until it is reset.
- In refactored `ChatView.handleSend`, the active assistant message id is never reset.
- Old `src/chatView.tsx` reset `activeAssistantIdRef.current = null` before sending, so each reply started a new assistant message.

## Tasks
### 1) Restore message boundary reset
- [x] Add a public `resetActiveAssistant()` (or `startNewAssistantMessage()`) in `useMessages`.
- [x] Call it in `ChatView.handleSend` before `client.sendPrompt(...)`.

### 3) Verification
- [x] Send a prompt, wait for assistant response, then send a second prompt: second response appears as a new message block.
- [x] Ensure partial streaming chunks still append to the same assistant message during a single response.
- [x] Confirm the fix does not break thought/tool update messages.

## Notes
- Source of regression is likely the missing reset in `ChatView.handleSend` after refactor.
