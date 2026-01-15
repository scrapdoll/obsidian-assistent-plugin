# Chat View Refactoring Tasks

## Phase 1: Foundation (Structure + Types + Utils)
- [x] Create folder structure under `src/chat/` (types, constants, utils, hooks, components)
- [x] Extract shared types to `src/chat/types/index.ts`
- [x] Extract constants to `src/chat/constants/`
- [x] Move pure utility functions to `src/chat/utils/` and update imports
- [x] Add minimal type guards/validators for unsafe casts

## Phase 2: Hooks (State & Side Effects)
- [x] Implement `useMessages` (append, appendAssistantText, clear)
- [x] Implement `usePermissions` (queue handling, resolve/cancel, focus restore)
- [x] Implement `useAttachments` (manual + auto attach, read file contents)
- [x] Implement `useDragDrop` (drag state + handlers)
- [x] Wire hooks in `ChatView` and remove duplicate refs/state

## Phase 3: Components (UI Split)
- [x] Extract `ChatHeader`
- [x] Extract `ChatMessages` + `ChatMessage`
- [x] Extract `PermissionPrompt`
- [x] Extract `AttachmentList` + `AttachmentItem`
- [x] Extract `ChatInput` + `ChatError`
- [x] Keep `ChatView` as orchestrator only

## Phase 4: Performance & Stability
- [x] Wrap handlers with `useCallback` where passed to child components
- [x] Memoize expensive computed values with `useMemo` (only after profiling)
- [x] Add `React.memo` to stable list items
- [ ] Re-check unnecessary re-renders using React DevTools Profiler
- [ ] Evaluate need for list virtualization (only if message volume warrants)

## Phase 5: Accessibility & UX
- [x] Add `aria-label`/`role`/`aria-live` where needed (status, errors, input)
- [x] Restore focus to input after send and permission actions
- [x] Ensure logical tab order and keyboard shortcuts
- [x] Replace non-semantic `div` with semantic elements where appropriate

## Phase 6: Type Safety & Strictness
- [x] Strengthen attachment types with discriminated unions (inline vs reference)
- [x] Remove unsafe type assertions; add narrowing helpers
- [x] Enable `strict: true` in `tsconfig.json` and fix resulting issues
- [ ] Add exhaustive checks for unions/switches

## Phase 7: Testing (Optional, if enabled)
- [ ] Add Vitest + RTL + test environment (jsdom/happy-dom)
- [ ] Mock `obsidian` and ACP client for unit tests
- [ ] Unit tests for utils and hooks
- [ ] Component tests for header, messages, input, permissions
- [ ] (Optional) E2E harness if needed for Obsidian desktop

## Phase 8: Final Polish
- [ ] Manual regression test in Obsidian (desktop + mobile if applicable)
- [ ] Verify build artifacts and bundle size impact
- [ ] Update docs/README if behavior changes
- [ ] Cleanup and remove dead code in `src/chatView.tsx`
