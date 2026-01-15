# Lint Fix Tasks (chat-view-refactoring)

## Scope
Resolve current eslint errors/warnings across chat refactor files and ACP client.

## Tasks
### 1) ACP client lint fixes
- [x] Replace disallowed `console.log` calls in `src/acp/client.ts` with `console.warn`/`console.error`/`console.debug` or remove them.
- [x] Fix `@typescript-eslint/restrict-template-expressions` in `src/acp/client.ts` by narrowing/serializing `unknown` before interpolation.

### 2) Chat view JSX/runtime fixes
- [x] Remove unused imports/handlers in `src/chat/ChatView.tsx` (`App`, `AcpClient`, drag handlers) or wire them up.
- [x] Fix `@typescript-eslint/no-misused-promises` in `src/chat/ChatView.tsx` by wrapping async handlers (e.g., `void onClickAsync()`).
- [x] Resolve `no-undef` React in `src/chat/ChatView.tsx`, `src/chat/components/ChatInput.tsx`, and `src/chat/components/ChatMessages.tsx` by importing React or switching to the automatic JSX runtime in config/eslint.

### 3) Attachment hook style & typing cleanup
- [x] Replace direct `element.style.*` assignments in `src/chat/hooks/useAttachments.ts` with CSS classes or `setCssProps`.
- [x] Remove or use the unused `AttachmentFileModal` in `src/chat/hooks/useAttachments.ts`.
- [x] Replace `any` usage and unsafe returns in `src/chat/hooks/useAttachments.ts` with explicit, safe types.

### 4) Permissions hook cleanup
- [x] Remove or use the unused `RequestPermissionRequest` in `src/chat/hooks/usePermissions.ts`.

### 5) Utility type safety fixes
- [x] Fix `@typescript-eslint/no-base-to-string` in `src/chat/utils/formatters.ts` by stringifying objects explicitly.
- [x] Fix unsafe `any` arguments/returns in `src/chat/utils/validators.ts` by typing inputs and validating before use.

### 6) Verification
- [x] Run `npm run lint` and confirm 0 errors/warnings.
