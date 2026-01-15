import { memo } from "react";
import type { Attachment } from "../types";

interface ChatInputProps {
    input: string;
    isSending: boolean;
    isDragActive: boolean;
    attachments: Attachment[];
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
            {attachments.length > 0 ? (
                <div className="assistant-chat-attachments">
                    {attachments.map((attachment) => {
                        const modeLabel =
                            attachment.mode === "inline" ? "inline" : "link";
                        const sourceLabel =
                            attachment.source === "auto" ? "active file" : "";
                        return (
                            <div
                                key={attachment.id}
                                className={`assistant-chat-attachment is-${attachment.source}`}
                            >
                                <div className="assistant-chat-attachment-main">
                                    <div className="assistant-chat-attachment-name">
                                        {attachment.name}
                                    </div>
                                    <div className="assistant-chat-attachment-meta">
                                        {attachment.size} · {modeLabel}
                                        {sourceLabel ? ` · ${sourceLabel}` : ""}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
            <div
                className={`assistant-chat-input-area${isDragActive ? " is-dragging" : ""}`}
            >
                <button
                    className="assistant-chat-attach-button"
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
                    className="assistant-chat-send-button"
                    type="submit"
                    disabled={isSending || (!input.trim() && attachments.length === 0)}
                >
                    Send
                </button>
            </div>
        </form>
    );
});
