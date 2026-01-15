import { memo } from "react";
import type { ChatMessage } from "../types";

interface ChatMessagesProps {
    messages: ChatMessage[];
    children?: React.ReactNode;
}

export const ChatMessages = memo(function ChatMessages({ messages, children }: ChatMessagesProps) {
    return (
        <div className="assistant-chat-messages">
            {messages.length === 0 ? (
                <div className="assistant-chat-empty">
                    Start a conversation to see responses here.
                </div>
            ) : null}
            {messages.map((message) => (
                <ChatMessageItem key={message.id} message={message} />
            ))}
            {children}
        </div>
    );
});

interface ChatMessageItemProps {
    message: ChatMessage;
}

export const ChatMessageItem = memo(function ChatMessageItem({ message }: ChatMessageItemProps) {
    return (
        <div className={`assistant-chat-message ${message.role}`}>
            {message.content}
        </div>
    );
});
