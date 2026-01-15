import { memo } from "react";
import type { ReactNode } from "react";
import type { ChatMessage } from "../types";

interface ChatMessagesProps {
    messages: ChatMessage[];
    children?: ReactNode;
}

export const ChatMessages = memo(function ChatMessages({ messages, children }: ChatMessagesProps) {
    return (
        <section className="assistant-chat-messages" aria-live="polite" aria-label="Chat messages">
            {messages.length === 0 ? (
                <div className="assistant-chat-empty">
                    Start a conversation to see responses here.
                </div>
            ) : null}
            {messages.map((message) => (
                <ChatMessageItem key={message.id} message={message} />
            ))}
            {children}
        </section>
    );
});

interface ChatMessageItemProps {
    message: ChatMessage;
}

export const ChatMessageItem = memo(function ChatMessageItem({ message }: ChatMessageItemProps) {
    return (
        <article className={`assistant-chat-message ${message.role}`}>
            {message.content}
        </article>
    );
});
