# Selected Text in Prompt - Specification

## 1. Overview
Enable automatic attachment of text selected by the user in the active editor to the chat assistant. When text is selected in a markdown file, it appears as an attachment in the chat. If the user changes the selection, the attachment updates. If the selection is cleared, the attachment is removed. The selected text attachment works alongside the existing auto-attached file functionality.

## 2. Goals
- Automatically capture text selections from the active editor.
- Show selected text as a distinct attachment type in the chat UI.
- Keep the attachment in sync with the current selection.
- Provide clear visual feedback to the user about what will be sent.
- Work seamlessly with existing file attachments.

## 3. Non-Goals
- Persisting selections across file switches or app restarts.
- Tracking selection history or undo/redo of attachments.
- Multi-file or multi-editor selection handling.
- Selection from non-Markdown views (PDF, canvas, etc.).

## 4. User Flows
1. User opens a markdown file and selects text.
2. The selected text appears as an attachment in the chat view (e.g., "Selected text: 45 chars").
3. User adjusts the selection (expands, shrinks, or moves to a different part of the file).
4. The attachment updates to reflect the new selection.
5. User clicks outside the selected text or presses Ctrl+D (deselect).
6. The attachment is removed from the chat.
7. User sends a message; the selected text is included in the prompt alongside any file attachments.

## 5. Functional Requirements
FR-1: Monitor text selection changes in the active MarkdownView editor.
FR-2: When text is selected, create a `SelectionAttachment` with the selected text content.
FR-3: When the selection changes, update the existing `SelectionAttachment` with new content.
FR-4: When the selection is cleared (empty), remove the `SelectionAttachment`.
FR-5: Display the selected text attachment visually distinct from file attachments (e.g., "Selected text" label).
FR-6: Include character count in the attachment metadata.
FR-7: Send the selected text content as part of the prompt when the user sends a message.
FR-8: Prevent attaching selections that exceed a size limit (e.g., 10KB).
FR-9: Clear the selected text attachment after sending the message.

## 6. Data Model Extensions

### 6.1 New Attachment Type
```typescript
export type SelectionAttachment = {
  id: string;
  kind: "selection";
  content: string;
  charCount: number;
  filePath: string;  // Source file path
  lineStart: number; // Starting line of selection
  lineEnd: number;   // Ending line of selection
};
```

### 6.2 Extended Attachment Union
```typescript
export type Attachment =
  | InlineAttachment
  | ReferenceAttachment
  | SelectionAttachment;
```

### 6.3 Selection State Hook
```typescript
interface UseSelectedTextProps {
  app: App;
  onSelectionChange: (selection: SelectionAttachment | null) => void;
}

interface UseSelectedTextReturn {
  currentSelection: SelectionAttachment | null;
};
```

## 7. UI Requirements
- Selected text attachment displays with a clear "Selected text" label.
- Show character count (e.g., "Selected text: 45 chars").
- Show source file name (e.g., "from notes.md").
- Visual distinction from file attachments (different icon or color).
- Allow user to remove the selected text attachment manually (same UX as file attachments).
- If selection is too large (>10KB), show a system message and don't attach.

## 8. ACP Integration
- Extend `buildPromptBlocks` to handle `SelectionAttachment`:
  - Add a `resource` block with `text` content containing the selected text.
  - Include metadata about the source file and line range in the resource.
- Prompt structure:
  ```
  [text block: user message]
  [resource block: selected text content]
  [resource/resource_link blocks: file attachments]
  ```

## 9. Constraints
- Maximum selection size: 10KB (configurable via constant).
- Only track selections in `MarkdownView` (ignore other view types).
- Local-only processing; no network calls for selection tracking.
- Selection attachment is transient—cleared after sending or deselecting.
- Only one selection attachment at a time (replace on new selection).

## 10. Error Handling
- **No active file**: Ignore selection events (no attachment).
- **Selection too large**: Show system message: "Selection too large to attach (max 10KB). Use file attachment instead."
- **Read failure**: Should not occur (selection is from active editor), but handle gracefully with system message.
- **Non-Markdown view**: Ignore selection events.

## 11. Security and Privacy
- Selection is captured locally from the active editor.
- User has full control: can deselect to remove the attachment.
- Attachment is clearly visible before sending.
- No background tracking or persistence of selections.

## 12. Implementation Strategy

### 12.1 Create `useSelectedText` Hook
**Location**: `src/chat/hooks/useSelectedText.ts`

**Responsibilities**:
- Listen to editor selection changes via Obsidian's `editor-change` or cursor-change events.
- Extract selected text using `editor.getSelection()`.
- Create/remove `SelectionAttachment` based on selection state.
- Debounce rapid selection changes (e.g., 200ms) to avoid excessive updates.
- Validate selection size against limit.

**Key Functions**:
```typescript
const extractSelection = (editor: Editor): string | null => {
  const selection = editor.getSelection();
  if (!selection) return null;
  return selection.trim() || null; // Ignore whitespace-only selections
};

const createSelectionAttachment = (app: App, text: string): SelectionAttachment => {
  const file = app.workspace.getActiveFile();
  const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
  const from = editor?.getCursor('from');
  const to = editor?.getCursor('to');

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

### 12.2 Integrate with `useAttachments` Hook
**Location**: `src/chat/hooks/useAttachments.ts`

**Changes**:
- Accept an optional `SelectionAttachment` as a prop or manage it internally.
- Merge selection attachment with file attachments when building the attachments list.
- Handle selection attachment removal alongside file attachments.

**Updated Interface**:
```typescript
export const useAttachments = ({ app, onMessage, selectionAttachment }: UseAttachmentsProps) => {
  // ...
  const allAttachments = selectionAttachment
    ? [...attachments, selectionAttachment]
    : attachments;

  return {
    attachments: allAttachments,
    // ... other returns
  };
};
```

### 12.3 Update `AttachmentList` Component
**Location**: `src/chat/components/AttachmentList.tsx`

**Changes**:
- Render `SelectionAttachment` with distinct styling.
- Show character count and source file name.
- Use a different icon (e.g., text icon instead of file icon).

**New Component**:
```typescript
export const SelectionAttachmentItem = memo(function SelectionAttachmentItem({
  attachment,
  onRemove,
}: {
  attachment: SelectionAttachment;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="assistant-chat-attachment is-selection">
      <div className="assistant-chat-attachment-main">
        <div className="assistant-chat-attachment-name">
          Selected text
        </div>
        <div className="assistant-chat-attachment-meta">
          {attachment.charCount} chars · from {attachment.filePath}
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

### 12.4 Update `buildPromptBlocks` in `useAttachments`
**Location**: `src/chat/hooks/useAttachments.ts`

**Changes**:
- Add case for `SelectionAttachment`:
  ```typescript
  if (attachment.kind === "selection") {
    blocks.push({
      type: "resource",
      resource: {
        uri: `selection://${attachment.filePath}#L${attachment.lineStart}-${attachment.lineEnd}`,
        text: attachment.content,
      },
    });
    continue;
  }
  ```

### 12.5 Wire Up in `ChatView`
**Location**: `src/chat/ChatView.tsx`

**Changes**:
- Use `useSelectedText` hook alongside existing hooks.
- Pass selection attachment to `useAttachments`.
- Clear selection attachment after sending.

**Integration Example**:
```typescript
const { currentSelection } = useSelectedText({ app, onSelectionChange: () => {} });

const {
  attachments,
  // ...
} = useAttachments({ app, onMessage: appendMessage, selectionAttachment: currentSelection });

const handleSend = async () => {
  // ... existing logic

  // Clear selection after send
  if (currentSelection) {
    // Clear selection in editor
    const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    editor?.setSelection(null);
  }
};
```

### 12.6 Add Constants
**Location**: `src/chat/constants/index.ts`

```typescript
export const MAX_SELECTION_SIZE = 10 * 1024; // 10KB
```

## 13. Testing Considerations

### Unit Tests
- Test `extractSelection` with various selection scenarios.
- Test `createSelectionAttachment` metadata extraction.
- Test size validation logic.
- Test debouncing behavior.

### Integration Tests
- Test full flow: select text → attachment appears → change selection → attachment updates → deselect → attachment removed.
- Test selection attachment with file attachments together.
- Test selection clearing after sending a message.
- Test selection size limit enforcement.

### Manual Testing
- Test with Obsidian desktop and Obsidian mobile (if applicable).
- Test with various file types (MD, MDX, TXT).
- Test with large files and small selections.
- Test edge cases: whitespace-only selections, empty selections, selections across multiple lines.

## 14. Acceptance Criteria
- AC-1: Selecting text in a markdown file creates a visible attachment in the chat.
- AC-2: Changing the selection updates the attachment content and metadata.
- AC-3: Clearing the selection removes the attachment.
- AC-4: Selection attachment shows character count and source file name.
- AC-5: Selection attachment can be manually removed by the user.
- AC-6: Selected text is included in the prompt when sending a message.
- AC-7: Selections larger than 10KB trigger a warning and are not attached.
- AC-8: Selection attachment is cleared after sending a message.
- AC-9: Selection attachment works alongside file attachments (both appear in the list).
- AC-10: Only one selection attachment exists at a time (new selection replaces old one).

## 15. Future Enhancements
- Add a setting to enable/disable the feature (currently always on).
- Allow configurable selection size limit.
- Support multi-range selections (if Obsidian API supports it).
- Add keyboard shortcut to quickly attach the current selection.
- Show a preview snippet of the selected text in the attachment.
- Persist selection across file switches (with user opt-in).

---

**Document Version**: 1.0
**Last Updated**: 2026-01-15
**Author**: Senior React/TypeScript Engineer (AI-Assisted)
