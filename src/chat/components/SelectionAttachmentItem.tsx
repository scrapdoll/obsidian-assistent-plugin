import { memo } from "react";
import type { SelectionAttachment } from "../types";

interface SelectionAttachmentItemProps {
    attachment: SelectionAttachment;
    onRemove: (id: string) => void;
}

const getFileName = (filePath: string): string => {
    const parts = filePath.split("/");
    return parts[parts.length - 1] || filePath;
};

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
