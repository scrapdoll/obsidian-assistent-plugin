import { memo } from "react";
import type { Attachment } from "../types";
import { AttachmentList } from "./AttachmentList";

interface ChatInputProps {
    input: string;
    isSending: boolean;
    isDragActive: boolean;
    attachments: Attachment[];
    onAttachmentRemove: (id: string) => void;
    onInputChange: (value: string) => void;
    onAttach: () => void;
    onSend: () => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export const ChatInput = memo(function ChatInput({
    input,
    isSending,
    isDragActive,
    attachments,
    onAttachmentRemove,
    onInputChange,
    onAttach,
    onSend,
    onKeyDown,
}: ChatInputProps) {
    return (
        <form
            className="assistant-chat-input"
            onSubmit={(event) => {
                event.preventDefault();
                void onSend();
            }}
        >
            <AttachmentList attachments={attachments} onRemove={onAttachmentRemove} />
            <div
                className={`assistant-chat-input-row${isDragActive ? " is-drop" : ""}`}
            >
                <button
                    className="assistant-chat-attach"
                    type="button"
                    onClick={onAttach}
                    disabled={isSending}
                >
                    Attach
                </button>
                <textarea
                    className="assistant-chat-textarea"
                    value={input}
                    onChange={(event) => onInputChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Ask assistant"
                    disabled={isSending}
                />
                <button
                    className="assistant-chat-send"
                    type="submit"
                    disabled={isSending || (!input.trim() && attachments.length === 0)}
                >
                    Send
                </button>
            </div>
        </form>
    );
});
