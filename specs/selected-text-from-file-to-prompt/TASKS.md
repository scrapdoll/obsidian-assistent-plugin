# Selected Text in Prompt - Implementation Tasks

This document breaks down the "Selected Text in Prompt" feature into actionable tasks. Tasks are ordered by dependency and estimated effort.

## Task Summary

| ID | Task | Effort | Priority |
|----|------|--------|----------|
| T1 | Update type definitions | 30m | High |
| T2 | Add constants | 10m | High |
| T3 | Create `useSelectedText` hook | 3h | High |
| T4 | Update `useAttachments` hook | 1.5h | High |
| T5 | Create `SelectionAttachmentItem` component | 1h | High |
| T6 | Update `AttachmentList` component | 30m | High |
| T7 | Update `ChatView` component | 1h | High |
| T8 | Update barrel exports | 15m | Medium |
| T9 | Add CSS styles for selection attachment | 30m | Medium |
| T10 | Manual testing and verification | 1h | High |

**Total Estimated Effort**: ~10 hours

---

## Task Details

### T1: Update Type Definitions

**File**: `src/chat/types/index.ts`

**Description**: Add new `SelectionAttachment` type and extend the `Attachment` union type.

**Dependencies**: None

**Effort**: 30 minutes

**Steps**:
1. Add `SelectionAttachment` type definition at the end of the file:
   ```typescript
   export type SelectionAttachment = {
       id: string;
       kind: "selection";
       content: string;
       charCount: number;
       filePath: string;
       lineStart: number;
       lineEnd: number;
   };
   ```

2. Update `Attachment` union type to include `SelectionAttachment`:
   ```typescript
   export type Attachment = InlineAttachment | ReferenceAttachment | SelectionAttachment;
   ```

**Acceptance Criteria**:
- Type definitions compile without errors
- TypeScript strict mode validates correctly

**Verification**:
```bash
npx tsc --noEmit
```

---

### T2: Add Constants

**File**: `src/chat/constants/index.ts`

**Description**: Add `MAX_SELECTION_SIZE` constant for selection size limit validation.

**Dependencies**: T1

**Effort**: 10 minutes

**Steps**:
1. Add constant at the end of the file:
   ```typescript
   export const MAX_SELECTION_SIZE = 10 * 1024; // 10KB
   ```

**Acceptance Criteria**:
- Constant is exported and accessible
- No compilation errors

---

### T3: Create `useSelectedText` Hook

**File**: `src/chat/hooks/useSelectedText.ts` (NEW)

**Description**: Implement a custom hook that monitors editor selection changes and creates/removes `SelectionAttachment` objects.

**Dependencies**: T1, T2

**Effort**: 3 hours

**Steps**:
1. Create new file `src/chat/hooks/useSelectedText.ts`

2. Import required dependencies:
   ```typescript
   import { useCallback, useEffect, useRef, useState } from "react";
   import type { App } from "obsidian";
   import type { MarkdownView } from "obsidian";
   import { MAX_SELECTION_SIZE } from "../constants";
   import { createMessageId } from "../utils";
   import type { SelectionAttachment } from "../types";
   ```

3. Define interfaces:
   ```typescript
   export interface UseSelectedTextProps {
       app: App;
       onSelectionChange?: (selection: SelectionAttachment | null) => void;
   }

   export interface UseSelectedTextReturn {
       currentSelection: SelectionAttachment | null;
   }
   ```

4. Implement `extractSelection` helper function:
   ```typescript
   const extractSelection = (editor: import("obsidian").Editor): string | null => {
       const selection = editor.getSelection();
       if (!selection) return null;
       return selection.trim() || null;
   };
   ```

5. Implement `createSelectionAttachment` helper function:
   ```typescript
   const createSelectionAttachment = (
       app: App,
       text: string
   ): SelectionAttachment | null => {
       if (text.length > MAX_SELECTION_SIZE) {
           return null;
       }

       const file = app.workspace.getActiveFile();
       const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
       const from = editor?.getCursor("from");
       const to = editor?.getCursor("to");

       return {
           id: createMessageId("selection"),
           kind: "selection",
           content: text,
           charCount: text.length,
           filePath: file?.path || "",
           lineStart: from?.line || 0,
           lineEnd: to?.line || 0,
       };
   };
   ```

6. Implement the main hook with:
   - State for `currentSelection`
   - Ref to track debounce timer
   - Effect to subscribe to `editor-change` events
   - Debounced selection update logic (200ms)
   - Cleanup on unmount

7. Export the hook:
   ```typescript
   export const useSelectedText = ({ app }: UseSelectedTextProps): UseSelectedTextReturn => {
       // Implementation
       return { currentSelection };
   };
   ```

**Acceptance Criteria**:
- Hook correctly extracts text selections from `MarkdownView`
- Selection changes update the attachment after 200ms debounce
- Selections larger than 10KB are ignored
- Whitespace-only selections are ignored
- Clearing selection sets `currentSelection` to `null`

**Related Spec Requirements**:
- FR-1, FR-2, FR-3, FR-4, FR-8

---

### T4: Update `useAttachments` Hook

**File**: `src/chat/hooks/useAttachments.ts`

**Description**: Modify `useAttachments` to accept and integrate `SelectionAttachment` with file attachments.

**Dependencies**: T1, T3

**Effort**: 1.5 hours

**Steps**:
1. Update `UseAttachmentsProps` interface:
   ```typescript
   interface UseAttachmentsProps {
       app: App;
       onMessage: (role: ChatMessageRole, content: string) => void;
       selectionAttachment?: SelectionAttachment | null;
   }
   ```

2. Add `selectionAttachment` parameter to hook signature:
   ```typescript
   export const useAttachments = ({
       app,
       onMessage,
       selectionAttachment = null
   }: UseAttachmentsProps) => {
   ```

3. Merge selection attachment with file attachments in the return value:
   ```typescript
   const allAttachments = selectionAttachment
       ? [...attachments, selectionAttachment]
       : attachments;

   return {
       attachments: allAttachments,
       // ... other returns
   };
   ```

4. Update `buildPromptBlocks` to handle `SelectionAttachment`:
   ```typescript
   for (const attachment of currentAttachments) {
       if (attachment.kind === "selection") {
           const uri = `selection://${attachment.filePath}#L${attachment.lineStart}-${attachment.lineEnd}`;
           blocks.push({
               type: "resource",
               resource: {
                   uri,
                   text: attachment.content,
               },
           });
           continue;
       }

       // ... existing file attachment logic
   }
   ```

5. Add validation to show system message for oversized selections:
   ```typescript
   if (selectionAttachment && selectionAttachment.charCount > MAX_SELECTION_SIZE) {
       onMessage("system", "Selection too large to attach (max 10KB). Use file attachment instead.");
   }
   ```

**Acceptance Criteria**:
- Selection attachments appear in the attachment list alongside file attachments
- `buildPromptBlocks` includes selection content as a resource block
- Oversized selections trigger system messages
- No compilation errors

**Related Spec Requirements**:
- FR-7, FR-8
- ACP Integration (Section 8)

---

### T5: Create `SelectionAttachmentItem` Component

**File**: `src/chat/components/SelectionAttachmentItem.tsx` (NEW)

**Description**: Create a dedicated component for rendering selection attachments with distinct visual styling.

**Dependencies**: T1

**Effort**: 1 hour

**Steps**:
1. Create new file `src/chat/components/SelectionAttachmentItem.tsx`

2. Import dependencies:
   ```typescript
   import { memo } from "react";
   import type { SelectionAttachment } from "../types";
   ```

3. Define component interface:
   ```typescript
   interface SelectionAttachmentItemProps {
       attachment: SelectionAttachment;
       onRemove: (id: string) => void;
   }
   ```

4. Implement helper function to extract file name:
   ```typescript
   const getFileName = (filePath: string): string => {
       const parts = filePath.split("/");
       return parts[parts.length - 1] || filePath;
   };
   ```

5. Implement the component with `memo` for performance:
   ```typescript
   export const SelectionAttachmentItem = memo(function SelectionAttachmentItem({
       attachment,
       onRemove,
   }: SelectionAttachmentItemProps) {
       return (
           <div className="assistant-chat-attachment is-selection">
               <div className="assistant-chat-attachment-main">
                   <div className="assistant-chat-attachment-name">
                       Selected text
                   </div>
                   <div className="assistant-chat-attachment-meta">
                       {attachment.charCount} chars · from {getFileName(attachment.filePath)}
                   </div>
               </div>
               <button
                   className="assistant-chat-attachment-remove"
                   type="button"
                   onClick={() => onRemove(attachment.id)}
                   aria-label="Remove selected text"
               >
                   Remove
               </button>
           </div>
       );
   });
   ```

**Acceptance Criteria**:
- Component renders with correct labels and metadata
- Remove button triggers `onRemove` callback
- Proper ARIA labels for accessibility
- Memoized to prevent unnecessary re-renders

**Related Spec Requirements**:
- FR-5, FR-6
- UI Requirements (Section 7)

---

### T6: Update `AttachmentList` Component

**File**: `src/chat/components/AttachmentList.tsx`

**Description**: Modify `AttachmentList` to render `SelectionAttachmentItem` for selection attachments.

**Dependencies**: T5

**Effort**: 30 minutes

**Steps**:
1. Import `SelectionAttachmentItem`:
   ```typescript
   import { SelectionAttachmentItem } from "./SelectionAttachmentItem";
   ```

2. Update the attachment rendering logic to handle different types:
   ```typescript
   {attachments.map((attachment) => (
       <li key={attachment.id}>
           {attachment.kind === "selection" ? (
               <SelectionAttachmentItem
                   attachment={attachment}
                   onRemove={onRemove}
               />
           ) : (
               <AttachmentItem
                   attachment={attachment}
                   onRemove={onRemove}
               />
           )}
       </li>
   ))}
   ```

**Acceptance Criteria**:
- Selection attachments render with distinct styling
- File attachments render with existing styling
- Type checking passes

---

### T7: Update `ChatView` Component

**File**: `src/chat/ChatView.tsx`

**Description**: Integrate `useSelectedText` hook and wire up selection attachment flow.

**Dependencies**: T3, T4

**Effort**: 1 hour

**Steps**:
1. Import `useSelectedText` and `MarkdownView`:
   ```typescript
   import { useSelectedText } from "./hooks";
   import type { MarkdownView } from "obsidian";
   ```

2. Add `useSelectedText` hook after existing hooks:
   ```typescript
   const { currentSelection } = useSelectedText({ app });
   ```

3. Pass `selectionAttachment` to `useAttachments`:
   ```typescript
   const {
       attachments,
       addAttachmentsFromPaths,
       handleAttachmentRemove,
       handleAttachClick,
       buildPromptBlocks,
       ensureAutoAttachment,
   } = useAttachments({
       app,
       onMessage: appendMessage,
       selectionAttachment: currentSelection
   });
   ```

4. Update `handleSend` to clear selection after sending:
   ```typescript
   const handleSend = useCallback(async () => {
       // ... existing logic

       // Clear selection in editor after send
       if (currentSelection) {
           const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
           editor?.setSelection(
               editor.getCursor("from"),
               editor.getCursor("from")
           );
       }
   }, [input, attachments, isSending, appendMessage, buildPromptBlocks, client, resetActiveAssistant, currentSelection, app]);
   ```

**Acceptance Criteria**:
- Selection tracking works in active `MarkdownView`
- Selection appears in attachment list
- Selection is cleared after sending message
- No TypeScript errors

**Related Spec Requirements**:
- FR-9
- Implementation Strategy 12.5

---

### T8: Update Barrel Exports

**Files**:
- `src/chat/hooks/index.ts`
- `src/chat/components/index.ts`

**Description**: Add new hook and component to barrel export files for clean imports.

**Dependencies**: T3, T5

**Effort**: 15 minutes

**Steps**:
1. Update `src/chat/hooks/index.ts`:
   ```typescript
   export { useMessages } from "./useMessages";
   export { usePermissions } from "./usePermissions";
   export { useAttachments } from "./useAttachments";
   export { useDragDrop } from "./useDragDrop";
   export { useKeyboardShortcuts } from "./useKeyboardShortcuts";
   export { useSelectedText } from "./useSelectedText"; // NEW
   ```

2. Update `src/chat/components/index.ts`:
   ```typescript
   export { ChatHeader } from "./ChatHeader";
   export { ChatMessages, ChatMessageItem } from "./ChatMessages";
   export { PermissionPrompt } from "./PermissionPrompt";
   export { AttachmentList, AttachmentItem } from "./AttachmentList";
   export { SelectionAttachmentItem } from "./SelectionAttachmentItem"; // NEW
   export { ChatError } from "./ChatError";
   export { ChatInput } from "./ChatInput";
   ```

**Acceptance Criteria**:
- Imports work correctly from barrel exports
- No circular dependencies

---

### T9: Add CSS Styles

**File**: `styles.css`

**Description**: Add CSS styles for visual distinction of selection attachments.

**Dependencies**: T5, T6

**Effort**: 30 minutes

**Steps**:
1. Add styles for selection attachment:
   ```css
   /* Selection attachment styling */
   .assistant-chat-attachment.is-selection {
       border-left: 3px solid var(--color-accent);
       background-color: rgba(var(--color-accent-rgb), 0.05);
   }

   .assistant-chat-attachment.is-selection .assistant-chat-attachment-name {
       font-weight: 600;
       color: var(--color-accent);
   }
   ```

2. Ensure visual distinction from file attachments (different color scheme, icon, or border)

**Acceptance Criteria**:
- Selection attachments have distinct visual appearance
- Styles match Obsidian's design system
- No CSS conflicts

**Related Spec Requirements**:
- UI Requirements (Section 7)

---

### T10: Manual Testing and Verification

**Description**: Comprehensive manual testing of the feature against acceptance criteria.

**Dependencies**: All previous tasks

**Effort**: 1 hour

**Steps**:

#### Test Case 1: Basic Selection Flow
1. Open a markdown file in Obsidian
2. Select some text (e.g., a paragraph)
3. Verify "Selected text" attachment appears in chat
4. Verify character count is displayed
5. Verify source file name is shown

#### Test Case 2: Selection Updates
1. With text selected, expand the selection
2. Verify attachment updates with new character count
3. Move selection to different part of file
4. Verify attachment content and metadata update

#### Test Case 3: Selection Clearing
1. Click outside selected text to deselect
2. Verify attachment is removed from chat
3. Verify no attachment exists in list

#### Test Case 4: Sending with Selection
1. Select text
2. Type a message in chat input
3. Click Send
4. Verify message is sent with selection included
5. Verify selection is cleared in editor after send

#### Test Case 5: Size Limit
1. Select text larger than 10KB
2. Verify system message appears: "Selection too large to attach (max 10KB). Use file attachment instead."
3. Verify no selection attachment is created

#### Test Case 6: Works with File Attachments
1. Open a file (auto-attaches as "active file")
2. Select text in the same file
3. Verify both attachments appear in list
4. Send a message
5. Verify both are included in prompt

#### Test Case 7: Manual Removal
1. Select text
2. Click "Remove" button on selection attachment
3. Verify attachment is removed
4. Verify selection in editor is still active (attachment removal doesn't affect editor)

#### Test Case 8: Edge Cases
1. Select only whitespace → verify no attachment
2. Switch to non-Markdown view → verify no selection tracking
3. Close file while selected → verify attachment is removed
4. Select text, then switch files → verify attachment is cleared

#### Test Case 9: Mobile Compatibility
1. Test on Obsidian mobile (if applicable)
2. Verify selection works with touch
3. Verify UI displays correctly on mobile

#### Test Case 10: Performance
1. Select text, then rapidly change selection
2. Verify debouncing prevents excessive updates
3. Verify no lag in UI

**Acceptance Criteria**:
- All 10 acceptance criteria from spec are met:
  - AC-1: Selecting text creates visible attachment
  - AC-2: Changing selection updates attachment
  - AC-3: Clearing selection removes attachment
  - AC-4: Attachment shows character count and source file
  - AC-5: Attachment can be manually removed
  - AC-6: Selected text included in prompt
  - AC-7: Large selections trigger warning
  - AC-8: Selection cleared after send
  - AC-9: Works with file attachments
  - AC-10: Only one selection at a time

**Build Verification**:
```bash
npm run build
npm run dev
```

---

## Task Dependencies

```
T2 (Constants)
  ↓
T1 (Types) ──→ T3 (useSelectedText) ────┐
                                    ↓
T4 (useAttachments) ←─────────────────┘
  ↓
T7 (ChatView)

T1 (Types) ──→ T5 (SelectionAttachmentItem) ──→ T6 (AttachmentList)
                                                      ↓
T5 (SelectionAttachmentItem) ──→ T8 (Barrel Exports)
                                                      ↓
                                              T9 (CSS Styles)
                                                      ↓
                                              T10 (Testing)
```

---

## Implementation Order

Execute tasks in the following order for smooth integration:

1. **Phase 1: Foundation** (T1, T2)
   - Establish type definitions and constants

2. **Phase 2: Core Logic** (T3, T4)
   - Implement selection tracking hook
   - Integrate with attachments system

3. **Phase 3: UI Components** (T5, T6)
   - Create selection attachment component
   - Update attachment list

4. **Phase 4: Integration** (T7, T8)
   - Wire up in main chat view
   - Update exports

5. **Phase 5: Polish** (T9, T10)
   - Add visual styling
   - Test and verify

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Selection changes trigger too many re-renders | Use 200ms debounce in `useSelectedText` |
| Selection from non-Markdown views | Check `MarkdownView` type before processing |
| Large selections cause performance issues | Enforce 10KB limit and validate early |
| Race condition between selection and file changes | Use refs to track latest state in async operations |
| Selection persists after file switch | Clear selection on `file-open` event |

---

## Notes for Implementation

- All new code should follow existing code style in the project
- Use `memo` for components that receive props that don't change frequently
- Debounce selection changes to avoid performance issues
- Handle edge cases gracefully (no active file, non-Markdown view, etc.)
- Maintain accessibility with proper ARIA labels
- Test on both desktop and mobile (if available)

---

**Document Version**: 1.0
**Last Updated**: 2026-01-15
**Based On**: `/specs/selected-text-in-prompt/SPEC.md`
