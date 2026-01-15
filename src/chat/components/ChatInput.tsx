import { memo, forwardRef } from "react";
import type { KeyboardEvent } from "react";
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
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

export const ChatInput = memo(forwardRef<HTMLTextAreaElement, ChatInputProps>(function ChatInput({
    input,
    isSending,
    isDragActive,
    attachments,
    onAttachmentRemove,
    onInputChange,
    onAttach,
    onSend,
    onKeyDown,
}: ChatInputProps, ref) {
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
                    aria-label="Attach file"
                >
                    Attach
                </button>
                <textarea
                    ref={ref}
                    className="assistant-chat-textarea"
                    value={input}
                    onChange={(event) => onInputChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Ask assistant"
                    disabled={isSending}
                    aria-label="Message input"
                    aria-multiline="true"
                />
                <button
                    className="assistant-chat-send"
                    type="submit"
                    disabled={isSending || (!input.trim() && attachments.length === 0)}
                    aria-label="Send message"
                >
                    Send
                </button>
            </div>
        </form>
    );
}));
