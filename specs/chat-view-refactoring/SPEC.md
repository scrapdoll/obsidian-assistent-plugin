# Chat View Refactoring Specification

## Executive Summary

This document provides a comprehensive audit and refactoring strategy for `src/chatView.tsx` (1,214 lines). The current implementation suffers from architectural violations, performance issues, and maintainability concerns that require systematic restructuring following clean architecture principles and modern React/TypeScript best practices.

---

## Constraints & Assumptions

- Obsidian plugin runtime: deliver a single bundled `main.js` (no code splitting or lazy-loaded chunks).
- Keep dependency footprint small; avoid adding heavy libraries unless profiling shows a clear need.
- React is already in use; avoid introducing additional UI frameworks.
- Testing infrastructure is not currently configured; any testing plan must include adding a runner and mocks for `obsidian`.

---

## Current State Analysis

### File Structure Overview

```
src/chatView.tsx (1,214 lines)
├── Types (lines 26-56)
│   ├── ChatMessageRole
│   ├── ChatMessage
│   ├── AttachmentSource
│   ├── Attachment
│   ├── PermissionRequestState
│   └── ChatViewProps
├── Constants (lines 58-97)
│   ├── INLINE_ATTACHMENT_LIMIT
│   └── TEXT_EXTENSIONS
├── Utility Functions (lines 99-554)
│   ├── ID Generation
│   ├── Error Formatting
│   ├── Path Resolution
│   ├── File Detection
│   └── Content Transformation
├── React Component (lines 391-1158)
│   ├── State Management
│   ├── Custom Logic
│   ├── Event Handlers
│   └── JSX Rendering
└── Obsidian Integration (lines 1160-1214)
    ├── AttachmentFileModal
    └── AssistantChatView
```

---

## Critical Issues Identified

### 1. Architectural Violations

#### 1.1 God Component Anti-Pattern
- **Severity**: 🔴 Critical
- **Location**: Lines 391-1158 (ChatView component, 767 lines)
- **Issue**: Single component handles multiple responsibilities:
  - Session management
  - Message state
  - Permission handling
  - Attachment management
  - File system operations
  - UI rendering
  - Drag & drop logic
- **Impact**: Unmaintainable, untestable, violates Single Responsibility Principle

#### 1.2 Mixed Abstraction Levels
- **Severity**: 🔴 Critical
- **Location**: Throughout file
- **Issue**: Utility functions, business logic, and UI rendering mixed together:
  - `normalizeSlashes`, `getVaultBasePath` (low-level utilities)
  - `buildPromptBlocks`, `ensureAutoAttachment` (business logic)
  - JSX rendering (UI layer)
- **Impact**: Difficult to reason about, hard to reuse components

#### 1.3 UI Layer Orchestrates External Side Effects
- **Severity**: 🟡 High
- **Location**: Lines 391-392, throughout component
- **Issue**: `ChatView` performs Obsidian file operations and ACP session handling inside the UI layer
- **Impact**: Harder to test and reason about; side effects should be isolated behind adapters/services

### 2. React Pattern Violations

#### 2.1 Excessive useState Usage
- **Severity**: 🟢 Medium
- **Location**: Lines 392-406
- **Issue**: Many interdependent `useState` hooks in a single component:
  ```typescript
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionQueue, setPermissionQueue] = useState<PermissionRequestState[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  ```
- **Impact**: State transitions are harder to reason about and coordinate

#### 2.2 Ref-to-State Synchronization
- **Severity**: 🟡 High
- **Location**: Lines 443-444, 796-798, 939-940
- **Issue**: Manual synchronization between refs and state:
  ```typescript
  useEffect(() => {
      attachmentsRef.current = attachments;
  }, [attachments]);
  ```
- **Impact**: Can be valid for async boundaries, but increases complexity and risk of stale or divergent state

#### 2.3 Complex useEffect Logic
- **Severity**: 🟡 High
- **Location**: Lines 693-733, 735-794
- **Issue**: Multiple effects with complex async logic and nested callbacks
- **Impact**: Difficult to debug, potential memory leaks, unclear cleanup

#### 2.4 Missing Custom Hooks
- **Severity**: 🟡 High
- **Location**: Throughout component
- **Issue**: Reusable logic not extracted:
  - Attachment management (could be `useAttachments`)
  - Permission queue (could be `usePermissionQueue`)
  - Session status (could be `useSessionStatus`)
- **Impact**: Code duplication, testing difficulties

### 3. Performance Issues

#### 3.1 Unnecessary Re-renders
- **Severity**: 🟡 High
- **Location**: Lines 409-417 (appendMessage), throughout component
- **Issue**: Functions recreated on every render can cause child re-renders if passed to memoized components
- **Impact**: Potential performance cost in large message histories; confirm via profiling

#### 3.2 Large List Rendering Without Optimization
- **Severity**: 🟡 High
- **Location**: Lines 1013-1017 (messages.map)
- **Issue**: No virtualization or windowing for large message lists
- **Impact**: Performance degradation as conversation grows; validate expected message volume

#### 3.3 Missing Memoization
- **Severity**: 🟢 Medium
- **Location**: Throughout JSX rendering
- **Issue**: Computed values recalculated on every render:
  ```typescript
  const statusLabel = useMemo(() => { /* ... */ }, [isSending, status]);
  ```
- Only some values memoized, many missing
- **Impact**: Potential wasted work; avoid premature memoization without profiling

### 4. TypeScript Issues

#### 4.1 Weak Type Definitions
- **Severity**: 🟢 Medium
- **Location**: Lines 26-56
- **Issue**: Types do not encode invariants, forcing runtime checks:
  ```typescript
  type Attachment = {
      content?: string;  // Optional; requires runtime checks
  };
  ```
- **Impact**: More conditional logic and weaker guarantees; consider discriminated unions for inline vs reference attachments

#### 4.2 Unsafe Type Assertions
- **Severity**: 🟡 High
- **Location**: Lines 157, 162, 180-186
- **Issue**: Type casting without validation:
  ```typescript
  const message = (value as { message?: unknown }).message;
  const data = (current as { data?: unknown }).data;
  ```
- **Impact**: Type system circumvented, potential runtime errors

### 5. Accessibility Issues

#### 5.1 Missing ARIA Attributes
- **Severity**: 🟡 High
- **Location**: Throughout JSX
- **Issue**: No ARIA labels, roles, or descriptions:
  ```typescript
  <textarea
      className="assistant-chat-textarea"
      value={input}
      onChange={(event) => setInput(event.target.value)}
      placeholder="Ask the assistant"
  />
  ```
- **Impact**: Poor screen reader experience, especially for input and status elements

#### 5.2 Missing Focus Management
- **Severity**: 🟡 High
- **Location**: Lines 1134-1142 (textarea), no focus restoration
- **Issue**: Focus is not consistently restored to the input after actions (send, permission select, errors)
- **Impact**: Keyboard navigation friction

#### 5.3 Semantic HTML Violations
- **Severity**: 🟢 Medium
- **Location**: Throughout JSX
- **Issue**: Using `div` instead of semantic elements:
  ```typescript
  <div className="assistant-chat-message">...</div>
  ```
- **Impact**: Poor semantic structure for assistive technologies

### 6. Code Quality Issues

#### 6.1 Magic Numbers and Strings
- **Severity**: 🟢 Medium
- **Location**: Line 58 (INLINE_ATTACHMENT_LIMIT), 113-114, 370
- **Issue**: Hard-coded values without clear semantics
- **Impact**: Difficult to understand and maintain

#### 6.2 Deep Nesting
- **Severity**: 🟡 High
- **Location**: Lines 122-189 (isPromptParamError), 514-526
- **Issue**: Nested conditional logic 4+ levels deep
- **Impact**: Difficult to read and maintain

#### 6.3 Long Functions
- **Severity**: 🟡 High
- **Location**: Lines 566-619 (ensureAutoAttachment, 54 lines), 621-691 (buildPromptBlocks, 71 lines)
- **Issue**: Functions exceed 50 lines with complex logic
- **Impact**: Cognitive overload, difficult to test

---

## Refactoring Strategy

### Phase 1: Foundation (Immediate)

#### 1.1 Extract Utilities
**Goal**: Move pure functions to dedicated modules

**Actions**:
```
src/chatView.tsx → src/chat/
├── utils/
│   ├── idGenerator.ts      # createMessageId
│   ├── formatters.ts       # formatError, formatBytes, formatPermissionInput
│   ├── paths.ts            # normalizeSlashes, toVaultRelativePath, toVaultUri
│   ├── content.ts          # contentToText, describeToolCall
│   └── fileDetection.ts    # isTextFile, TEXT_EXTENSIONS, INLINE_ATTACHMENT_LIMIT
└── types/
    └── index.ts            # All shared types
```

**Priority**: 🔴 Critical
**Estimated Effort**: 4 hours

#### 1.2 Extract Hooks
**Goal**: Create custom hooks for reusable logic

**Actions**:
```
src/chat/hooks/
├── useSessionStatus.ts    # Manages connection status
├── useMessages.ts         # Manages message state and operations
├── usePermissions.ts      # Manages permission queue
├── useAttachments.ts     # Manages attachments and auto-attach logic
├── useDragDrop.ts         # Manages drag and drop state
└── useKeyboardShortcuts.ts # Manages keyboard interactions
```

**Priority**: 🔴 Critical
**Estimated Effort**: 8 hours

#### 1.3 Extract UI Components
**Goal**: Split monolithic JSX into focused components

**Actions**:
```
src/chat/components/
├── ChatHeader.tsx         # Header with status
├── ChatMessages.tsx       # Message list container
├── ChatMessage.tsx        # Individual message
├── PermissionPrompt.tsx   # Permission request UI
├── AttachmentList.tsx     # Attached files display
├── AttachmentItem.tsx     # Single attachment
├── ChatInput.tsx          # Input area
└── ChatError.tsx          # Error display
```

**Priority**: 🔴 Critical
**Estimated Effort**: 12 hours

### Phase 2: Performance Optimization (Short-term)

#### 2.1 Implement Memoization
**Goal**: Reduce unnecessary re-renders

**Actions**:
- Wrap event handlers in `useCallback`
- Memoize computed values with `useMemo`
- Extract static sub-components
- Use `React.memo` for list items
- Consider list virtualization/windowing only if message volume warrants it; avoid new deps unless necessary

**Priority**: 🟡 High
**Estimated Effort**: 6 hours

#### 2.2 Optimize State Updates
**Goal**: Reduce state complexity

**Actions**:
- Consolidate related state with `useReducer`
- Remove redundant ref-to-state syncing
- Use functional state updates where appropriate
- Implement optimistic updates for user actions

**Priority**: 🟡 High
**Estimated Effort**: 4 hours

### Phase 3: Accessibility Enhancement (Medium-term)

#### 3.1 Add ARIA Attributes
**Goal**: Improve screen reader support

**Actions**:
- Add `aria-label` to all interactive elements
- Implement `aria-live` regions for dynamic content
- Add `role` attributes where appropriate
- Provide accessible descriptions for complex UI

**Priority**: 🟡 High
**Estimated Effort**: 4 hours

#### 3.2 Improve Focus Management
**Goal**: Better keyboard navigation

**Actions**:
- Restore focus to the input after send and permission actions
- Add focus restoration after errors
- Ensure logical tab order
- If the permission prompt becomes a modal/dialog, add a focus trap
- Add keyboard shortcuts for common actions

**Priority**: 🟡 High
**Estimated Effort**: 3 hours

#### 3.3 Semantic HTML
**Goal**: Better document structure

**Actions**:
- Use `<header>`, `<main>`, `<section>`, `<article>` instead of `<div>`
- Use `<button>` for all interactive elements (already mostly done)
- Use `<form>` for input (already done)
- Add proper heading hierarchy

**Priority**: 🟢 Medium
**Estimated Effort**: 2 hours

### Phase 4: Type Safety (Medium-term)

#### 4.1 Strengthen Type Definitions
**Goal**: Eliminate runtime type errors

**Actions**:
- Replace `any` with proper types
- Add type guards for type narrowing
- Remove unsafe type assertions
- Use discriminated unions for variants

**Priority**: 🟡 High
**Estimated Effort**: 4 hours

#### 4.2 Enable Strict Mode
**Goal**: Catch issues at compile time

**Actions**:
- Enable `strict: true` in tsconfig (currently using several strict flags but not full `strict`)
- Fix all resulting type errors
- Add exhaustive checks on switch statements

**Priority**: 🟡 High
**Estimated Effort**: 2 hours

### Phase 5: Testing Infrastructure (Ongoing)
Note: This phase assumes we add a test runner and mocks; there is no existing setup in this repo.

#### 5.1 Unit Tests
**Goal**: Test pure functions and hooks

**Actions**:
```
src/chat/
├── utils/
│   ├── __tests__/
│   │   ├── idGenerator.test.ts
│   │   ├── formatters.test.ts
│   │   ├── paths.test.ts
│   │   └── content.test.ts
└── hooks/
    └── __tests__/
        ├── useSessionStatus.test.ts
        ├── useMessages.test.ts
        ├── usePermissions.test.ts
        └── useAttachments.test.ts
```

**Priority**: 🟡 High
**Estimated Effort**: 12 hours

#### 5.2 Integration Tests
**Goal**: Test component interactions

**Actions**:
```
src/chat/components/__tests__/
├── ChatHeader.test.tsx
├── ChatMessages.test.tsx
├── PermissionPrompt.test.tsx
├── AttachmentList.test.tsx
└── ChatInput.test.tsx
```

**Priority**: 🟡 High
**Estimated Effort**: 8 hours

---

## Proposed Architecture

Note: Keep the structure minimal for a plugin-sized codebase. The `services/` layer is optional; only introduce it if it reduces complexity or isolates Obsidian/ACP side effects cleanly.

### Directory Structure (After Refactoring)

```
src/
├── chat/
│   ├── types/
│   │   ├── index.ts                    # Shared type definitions
│   │   ├── chat.ts                     # Chat-related types
│   │   ├── attachment.ts              # Attachment types
│   │   └── permission.ts              # Permission types
│   │
│   ├── constants/
│   │   ├── index.ts                    # All constants
│   │   ├── files.ts                   # File-related constants
│   │   └── limits.ts                  # Size limits, etc.
│   │
│   ├── utils/
│   │   ├── idGenerator.ts
│   │   ├── formatters.ts
│   │   ├── paths.ts
│   │   ├── content.ts
│   │   ├── fileDetection.ts
│   │   └── validators.ts              # Type guards
│   │
│   ├── hooks/
│   │   ├── useSessionStatus.ts
│   │   ├── useMessages.ts
│   │   ├── usePermissions.ts
│   │   ├── useAttachments.ts
│   │   ├── useDragDrop.ts
│   │   └── useKeyboardShortcuts.ts
│   │
│   ├── components/
│   │   ├── ChatHeader.tsx
│   │   ├── ChatMessages.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── PermissionPrompt.tsx
│   │   ├── AttachmentList.tsx
│   │   ├── AttachmentItem.tsx
│   │   ├── ChatInput.tsx
│   │   ├── ChatError.tsx
│   │   └── index.ts                   # Barrel exports
│   │
│   ├── services/
│   │   ├── attachmentService.ts      # Attachment operations
│   │   ├── permissionService.ts       # Permission handling
│   │   └── messageService.ts          # Message operations
│   │
│   ├── ChatView.tsx                   # Main component (orchestrator)
│   └── index.ts                       # Barrel exports
│
└── obsidian/
    └── AttachmentFileModal.ts         # Obsidian-specific modal
```

### Component Hierarchy

```
ChatView (Orchestrator)
├── ChatHeader
│   ├── Title
│   └── StatusIndicator
├── ChatMessages (optional windowing if message volume grows)
│   ├── ChatMessage[]
│   │   ├── UserMessage
│   │   ├── AssistantMessage
│   │   └── SystemMessage
│   ├── PermissionPrompt (if active)
│   └── ChatError (if error)
└── ChatInput
    ├── AttachmentList
    │   └── AttachmentItem[]
    ├── AttachButton
    ├── TextInput
    └── SendButton
```

---

## Migration Plan

### Step-by-Step Migration

#### Step 1: Create Foundation Structure (Week 1)
```bash
# Create directory structure
mkdir -p src/chat/{types,constants,utils,hooks,components,services}
# Optional if tests are added
mkdir -p src/chat/__tests__

# Create barrel exports
touch src/chat/index.ts
touch src/chat/components/index.ts
touch src/chat/types/index.ts
```

#### Step 2: Extract Utilities (Week 1-2)
- Copy utility functions to new modules
- Add unit tests (if testing infrastructure is added)
- Update imports in chatView.tsx
- Run tests to ensure no breaking changes

#### Step 3: Extract Hooks (Week 2-3)
- Create useSessionStatus hook
- Create useMessages hook
- Create usePermissions hook
- Create useAttachments hook
- Update ChatView to use hooks
- Add hook tests (if testing infrastructure is added)

#### Step 4: Extract Components (Week 3-4)
- Extract ChatHeader component
- Extract ChatMessages component
- Extract PermissionPrompt component
- Extract AttachmentList component
- Extract ChatInput component
- Update ChatView to use components
- Add component tests (if testing infrastructure is added)

#### Step 5: Performance Optimization (Week 4)
- Add React.memo to list items
- Implement virtualization for ChatMessages
- Optimize callbacks with useCallback
- Optimize computed values with useMemo

#### Step 6: Accessibility (Week 5)
- Add ARIA attributes
- Implement focus management
- Convert to semantic HTML
- Test with screen reader

#### Step 7: Type Safety (Week 5-6)
- Strengthen type definitions
- Add type guards
- Remove unsafe type assertions
- Enable strict mode

#### Step 8: Final Polish (Week 6)
- Comprehensive testing
- Performance profiling
- Documentation
- Code review

### Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking changes during migration | High | Medium | Feature flags, gradual migration, extensive testing |
| Performance regression | Medium | Low | Performance benchmarks before/after |
| Loss of functionality | High | Low | Comprehensive integration tests, manual testing |
| Increased bundle size | Medium | Low | Avoid new deps, verify tree shaking (no code splitting in plugin bundle) |
| Team unfamiliarity with new structure | Medium | Medium | Documentation, pair programming, code reviews |

---

## Testing Strategy

### Unit Tests

**Coverage Goals**:
- Utilities: 100%
- Hooks: 90%+
- Services: 90%+

**Framework**: Not currently configured; recommend Vitest if we add tests (fast, good ESM support)
**Test environment**: jsdom or happy-dom, with explicit mocks for the `obsidian` module and ACP client

**Example Test Structure**:
```typescript
// src/chat/utils/__tests__/formatters.test.ts
import { describe, it, expect } from 'vitest';
import { formatError, formatBytes } from '../formatters';

describe('formatError', () => {
    it('formats Error objects correctly', () => {
        const error = new Error('Test error');
        expect(formatError(error)).toBe('Test error');
    });

    it('handles objects with message property', () => {
        const error = { message: 'Object error', code: 500 };
        expect(formatError(error)).toBe('Object error [code 500]');
    });
});
```

### Hook Tests

**Framework**: @testing-library/react (use `renderHook`; `@testing-library/react-hooks` is deprecated)

**Example**:
```typescript
// src/chat/hooks/__tests__/useMessages.test.ts
import { renderHook, act } from '@testing-library/react';
import { useMessages } from '../useMessages';

describe('useMessages', () => {
    it('adds new messages', () => {
        const { result } = renderHook(() => useMessages());

        act(() => {
            result.current.appendMessage('user', 'Hello');
        });

        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0]).toMatchObject({
            role: 'user',
            content: 'Hello'
        });
    });
});
```

### Component Tests

**Framework**: @testing-library/react

**Example**:
```typescript
// src/chat/components/__tests__/ChatHeader.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatHeader } from '../ChatHeader';

describe('ChatHeader', () => {
    it('displays correct status label', () => {
        render(
            <ChatHeader
                status="ready"
                isSending={false}
            />
        );

        expect(screen.getByText('Ready')).toBeInTheDocument();
    });
});
```

### Integration Tests

**Framework**: @testing-library/react with test context

**Scenario Tests**:
- Full message flow (user → assistant → response)
- Permission request workflow
- Attachment handling
- Error recovery

### E2E Tests (Optional)

**Framework**: Playwright

**Scenarios**:
- Full conversation flow
- Drag and drop attachments
- Permission handling
- Error states
**Note**: Running E2E inside Obsidian desktop is non-trivial; treat as optional and plan a harness if needed.

---

## Success Metrics

### Code Quality Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| File size (lines) | 1,214 | <200 per file | Line count |
| Cyclomatic complexity | ~50 | <15 per function | Static analysis |
| Test coverage | 0% | 80%+ | Test runner coverage (if added) |
| TypeScript strictness | Partial | Full | tsconfig strict mode |
| A11y score | F | A | axe-core + manual checklist (Lighthouse is not applicable in Obsidian) |

### Performance Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Initial render time | N/A | Baseline or better | React DevTools Profiler + performance marks |
| Message append time | N/A | <16ms on typical hardware | Performance.mark |
| Re-renders per interaction | N/A | <3 | React DevTools Profiler |
| Bundle size impact | N/A | <50KB incremental | esbuild metafile analysis |

### Maintainability Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Components per file | 1 | 1-3 | File analysis |
| Hook complexity | N/A | <10 | Complexity analysis |
| Prop drilling depth | N/A | <3 levels | Component analysis |
| Documentation coverage | 0% | 100% public API | JSDoc comments |

---

## Rollback Plan

### If Issues Arise During Migration

1. **Feature Flags**: Wrap new components in flags for gradual rollout
2. **Version Control**: Create branch per phase, easy to revert
3. **Backup**: Keep original file until migration is complete
4. **Monitoring**: Add error tracking to catch regressions early

### Rollback Steps

```bash
# If critical issues found
git revert <migration-commit>
# or
git restore --source <stable-branch> -- src/chatView.tsx
```

---

## Open Questions

1. **State Management Library**: Should we use a state management library (Zustand/Jotai) for complex state, or stick with hooks?
   - Recommendation: Start with hooks, introduce Zustand if complexity grows

2. **Virtualization**: Do we need list virtualization at all, or is a simple list sufficient?
   - Recommendation: Only add if profiling shows a need; prefer react-window if we do

3. **Form Library**: Should we use a form library (react-hook-form) for the input?
   - Recommendation: No - current form is simple enough with native handling

4. **Testing Framework**: Should we add Vitest or Jest?
   - Recommendation: Vitest (fast, good ESM support)

5. **Accessibility Tooling**: Should we add jest-axe for automated a11y testing?
   - Recommendation: Yes - catches regressions automatically

6. **Testing setup**: Do we want to introduce a test runner and fix the current `npm test` script (it references a missing file)?
   - Recommendation: Decide early; add Vitest + RTL if tests are in scope

---

## References

### Best Practices
- [React Documentation](https://react.dev)
- [React Accessibility Guidelines](https://react.dev/learn/accessibility)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Kent C. Dodds' React Patterns](https://kentcdodds.com/blog)

### Internal References
- Project package.json (for dependencies)
- AGENTS.md (project conventions)
- Existing test files (for patterns)

---

## Appendix: Code Examples

### A.1: Custom Hook Pattern (useMessages)

```typescript
// src/chat/hooks/useMessages.ts
import { useState, useCallback, useRef } from 'react';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export const useMessages = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const activeAssistantIdRef = useRef<string | null>(null);

    const appendMessage = useCallback((role: ChatMessage['role'], content: string) => {
        setMessages(prev => [...prev, {
            id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role,
            content
        }]);
    }, []);

    const appendAssistantText = useCallback((text: string) => {
        if (!text) return;

        setMessages(prev => {
            const activeId = activeAssistantIdRef.current;
            if (activeId) {
                const index = prev.findIndex(m => m.id === activeId);
                if (index !== -1) {
                    const next = [...prev];
                    next[index] = { ...next[index], content: next[index].content + text };
                    return next;
                }
            }

            const id = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            activeAssistantIdRef.current = id;
            return [...prev, { id, role: 'assistant', content: text }];
        });
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
        activeAssistantIdRef.current = null;
    }, []);

    return {
        messages,
        appendMessage,
        appendAssistantText,
        clearMessages
    };
};
```

### A.2: Component Pattern (ChatHeader)

```typescript
// src/chat/components/ChatHeader.tsx
import React, { memo } from 'react';
import type { Status } from '../types';

interface ChatHeaderProps {
    status: Status;
    isSending: boolean;
}

export const ChatHeader = memo(function ChatHeader({ status, isSending }: ChatHeaderProps) {
    const statusLabel = getStatusLabel(status, isSending);
    const statusTone = getStatusTone(status, isSending);

    return (
        <header className="assistant-chat-header">
            <div>
                <h1 className="assistant-chat-title">Assistant</h1>
                <p className="assistant-chat-subtitle">Agent session</p>
            </div>
            <div className={`assistant-chat-status is-${statusTone}`} role="status" aria-live="polite">
                <span className="assistant-chat-status-dot" aria-hidden="true" />
                <span>{statusLabel}</span>
            </div>
        </header>
    );
});

function getStatusLabel(status: Status, isSending: boolean): string {
    if (status === 'error') return 'Disconnected';
    if (isSending) return 'Generating';
    if (status === 'connecting') return 'Connecting';
    return 'Ready';
}

function getStatusTone(status: Status, isSending: boolean): string {
    if (status === 'error') return 'error';
    if (isSending) return 'busy';
    if (status === 'connecting') return 'connecting';
    return 'ready';
}
```

### A.3: Refactored ChatView (Simplified)

```typescript
// src/chat/ChatView.tsx
import React, { useEffect } from 'react';
import type { App } from 'obsidian';
import type AcpClient from 'acp/client';
import { useSessionStatus } from './hooks/useSessionStatus';
import { useMessages } from './hooks/useMessages';
import { usePermissions } from './hooks/usePermissions';
import { useAttachments } from './hooks/useAttachments';
import { useDragDrop } from './hooks/useDragDrop';
import { ChatHeader } from './components/ChatHeader';
import { ChatMessages } from './components/ChatMessages';
import { PermissionPrompt } from './components/PermissionPrompt';
import { AttachmentList } from './components/AttachmentList';
import { ChatInput } from './components/ChatInput';
import { ChatError } from './components/ChatError';

interface ChatViewProps {
    client: AcpClient;
    app: App;
}

export const ChatView = ({ client, app }: ChatViewProps) => {
    const { status, error } = useSessionStatus(client);
    const {
        messages,
        appendMessage,
        appendAssistantText
    } = useMessages();

    const {
        activePermission,
        pendingPermissionCount,
        handlePermissionSelect,
        handlePermissionCancel
    } = usePermissions(client, appendMessage);

    const {
        attachments,
        isDragActive,
        addAttachment,
        removeAttachment,
        dragHandlers
    } = useAttachments(app, appendMessage);

    const handleSend = async (input: string) => {
        // Send logic here
    };

    return (
        <div className="assistant-chat-root" {...dragHandlers}>
            <ChatHeader status={status} isSending={false} />
            <main className="assistant-chat-messages">
                <ChatMessages messages={messages} />
                {activePermission && (
                    <PermissionPrompt
                        request={activePermission.request}
                        pendingCount={pendingPermissionCount}
                        onSelect={handlePermissionSelect}
                        onCancel={handlePermissionCancel}
                    />
                )}
                {error && <ChatError message={error} />}
            </main>
            <ChatInput
                attachments={attachments}
                isDragActive={isDragActive}
                onAttach={addAttachment}
                onRemove={removeAttachment}
                onSend={handleSend}
            />
        </div>
    );
};
```

---

## Conclusion

This refactoring will transform `chatView.tsx` from a monolithic, unmaintainable component into a well-architected, testable, and performant solution. The phased approach ensures minimal disruption while delivering incremental improvements.

**Estimated Total Effort**: 45-50 hours over 6 weeks

**Risk Level**: Medium (mitigated by careful planning and testing)

**ROI**: High - improved maintainability, testability, and developer experience

---

*Document Version: 1.0*
*Last Updated: 2026-01-15*
*Author: Senior React/TypeScript Engineer (AI-Assisted)*
