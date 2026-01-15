import { memo } from "react";

export const ChatError = memo(function ChatError({ message }: { message: string }) {
    return <div className="assistant-chat-error">{message}</div>;
});
