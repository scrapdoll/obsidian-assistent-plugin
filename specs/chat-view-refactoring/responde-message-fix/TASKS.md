# Chat View Response Message Merge Regression Tasks

## Symptom
New assistant responses append to the first assistant message instead of creating a new message block.

## Findings (from `src/chat/*`)
- `useMessages.appendAssistantText` appends to `activeAssistantIdRef` until it is reset.
- In refactored `ChatView.handleSend`, the active assistant message id is never reset.
- Old `src/chatView.tsx` reset `activeAssistantIdRef.current = null` before sending, so each reply started a new assistant message.

## Tasks
### 1) Restore message boundary reset
- [ ] Add a public `resetActiveAssistant()` (or `startNewAssistantMessage()`) in `useMessages`.
- [ ] Call it in `ChatView.handleSend` before `client.sendPrompt(...)`.
- [ ] Consider also resetting when a new session starts or on explicit "stop" action (if any).

### 2) Guard against cross-request append
- [ ] If ACP provides a "response start" or "turn start" event, reset there instead of only on send.
- [ ] Ensure `appendAssistantText` creates a new assistant message if the last message is not `assistant`.

### 3) Verification
- [ ] Send a prompt, wait for assistant response, then send a second prompt: second response appears as a new message block.
- [ ] Ensure partial streaming chunks still append to the same assistant message during a single response.
- [ ] Confirm the fix does not break thought/tool update messages.

## Notes
- Source of regression is likely the missing reset in `ChatView.handleSend` after refactor.
