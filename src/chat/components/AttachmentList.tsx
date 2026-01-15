import { memo } from "react";
import type { Attachment } from "../types";
import { formatBytes } from "../utils";

interface AttachmentListProps {
    attachments: Attachment[];
    onRemove: (id: string) => void;
}

export const AttachmentList = memo(function AttachmentList({
    attachments,
    onRemove,
}: AttachmentListProps) {
    if (attachments.length === 0) {
        return null;
    }

    return (
        <div className="assistant-chat-attachments">
            {attachments.map((attachment) => (
                <AttachmentItem
                    key={attachment.id}
                    attachment={attachment}
                    onRemove={onRemove}
                />
            ))}
        </div>
    );
});

interface AttachmentItemProps {
    attachment: Attachment;
    onRemove: (id: string) => void;
}

export const AttachmentItem = memo(function AttachmentItem({
    attachment,
    onRemove,
}: AttachmentItemProps) {
    const modeLabel = attachment.mode === "inline" ? "inline" : "link";
    const sourceLabel = attachment.source === "auto" ? "active file" : "";

    return (
        <div
            className={`assistant-chat-attachment is-${attachment.source}`}
        >
            <div className="assistant-chat-attachment-main">
                <div className="assistant-chat-attachment-name">
                    {attachment.name}
                </div>
                <div className="assistant-chat-attachment-meta">
                    {formatBytes(attachment.size)} · {modeLabel}
                    {sourceLabel ? ` · ${sourceLabel}` : ""}
                </div>
            </div>
            <button
                className="assistant-chat-attachment-remove"
                type="button"
                onClick={() => onRemove(attachment.id)}
            >
                Remove
            </button>
        </div>
    );
});
