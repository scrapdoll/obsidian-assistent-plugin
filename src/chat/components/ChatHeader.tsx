import { memo } from "react";

interface ChatHeaderProps {
    status: "connecting" | "ready" | "error";
    isSending: boolean;
}

export const ChatHeader = memo(function ChatHeader({ status, isSending }: ChatHeaderProps) {
    const statusLabel = getStatusLabel(status, isSending);
    const statusTone = getStatusTone(status, isSending);

    return (
        <div className="assistant-chat-header">
            <div>
                <div className="assistant-chat-title">Assistant</div>
                <div className="assistant-chat-subtitle">Agent session</div>
            </div>
            <div className={`assistant-chat-status is-${statusTone}`}>
                <span className="assistant-chat-status-dot" />
                <span>{statusLabel}</span>
            </div>
        </div>
    );
});

function getStatusLabel(status: "connecting" | "ready" | "error", isSending: boolean): string {
    if (status === "error") {
        return "Disconnected";
    }

    if (isSending) {
        return "Generating";
    }

    if (status === "connecting") {
        return "Connecting";
    }

    return "Ready";
}

function getStatusTone(status: "connecting" | "ready" | "error", isSending: boolean): string {
    if (status === "error") {
        return "error";
    }

    if (isSending) {
        return "busy";
    }

    if (status === "connecting") {
        return "connecting";
    }

    return "ready";
}
