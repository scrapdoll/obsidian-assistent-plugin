# Refactoring plan: selected-text attachment

## Goals
- Make selection attachments behave like normal attachments (consistent add/remove/send).
- Simplify the selection lifecycle and event subscriptions.
- Remove debug noise and reduce duplicated logic.
- Keep UI and prompt building predictable and testable.

## Findings from current changes
- `src/chat/hooks/useSelectedText.ts` has heavy debug logging, duplicated selection listeners, and unused imports/refs.
- `src/chat/hooks/useAttachments.ts` merges selection into `attachments`, but `handleAttachmentRemove` only affects file attachments, so removing a selection in the UI does nothing.
- `src/chat/components/AttachmentList.tsx` mixes selection and file attachments under a single `onRemove` signature, which hides the removal mismatch.
- `src/chat/ChatView.tsx` logs selection/attachments and does not supply `onSelectionChange` to handle errors (size limit feedback).
- `styles.css` uses `--color-accent-rgb` which may not exist in all themes.

## Lint findings (npm run lint)
- `src/chat/ChatView.tsx` has two `console.log` statements flagged by `no-console`.
- `src/chat/hooks/useAttachments.ts` has two `console.log` statements flagged by `no-console`.
- `src/chat/hooks/useSelectedText.ts` has unused `Editor` import and unused `activeViewRef`, plus multiple `console.log` statements flagged by `no-console`.

## Plan
1. Normalize selection API
   - Update `useSelectedText` to expose `clearSelection` and a single debounced `onSelectionChange` callback.
   - Remove console logs, unused refs/imports, and duplicated listeners.
   - Ensure event cleanup uses `app.workspace.offref` (store refs returned by `on`).

2. Fix selection removal flow
   - Change `AttachmentList` to pass a distinct handler for selection removal (e.g. `onRemoveSelection`).
   - Update `SelectionAttachmentItem` to call the selection-specific handler.
   - Wire `ChatView` to call `clearSelection` when selection is removed.

3. Simplify attachment composition
   - Keep file attachments inside `useAttachments` state; keep selection separate.
   - Add a small helper to merge `attachments + selection` when rendering and building prompt blocks.
   - Consider moving `buildPromptBlocks` into `src/chat/utils/attachments.ts` so it has one owner and can be tested.

4. Improve selection metadata and limits
   - Decide on line-number base (0-based vs 1-based) and make it consistent in `selection://` URIs.
   - If selection is too large, surface a system message via a callback (e.g. from `useSelectedText` to `ChatView`).

5. UI and style cleanup
   - Make selection meta resilient when `filePath` is empty (e.g. omit the `from ...` clause).
   - Provide a safe color fallback if `--color-accent-rgb` is missing.

6. Verification
   - Manual checks: select text, adjust selection, clear selection, remove via button, switch files, send prompt.
   - Ensure selection and file attachments both appear in the prompt blocks.

## Definition of done
- Selection removal works via UI button and after send.
- No console noise in normal use.
- Selection listener lifecycle has a single debounced source and cleans up correctly.
- Prompt building consistently includes selection content and file attachments.
