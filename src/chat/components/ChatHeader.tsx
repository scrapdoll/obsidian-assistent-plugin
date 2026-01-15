import { memo } from "react";

interface ChatHeaderProps {
    status: "connecting" | "ready" | "error";
    isSending: boolean;
}

export const ChatHeader = memo(function ChatHeader({ status, isSending }: ChatHeaderProps) {
    const statusLabel = getStatusLabel(status, isSending);
    const statusTone = getStatusTone(status, isSending);

    return (
        <header className="assistant-chat-header">
            <div>
                <h1 className="assistant-chat-title">Assistant</h1>
                <p className="assistant-chat-subtitle">Agent session</p>
            </div>
            <div className={`assistant-chat-status is-${statusTone}`} role="status" aria-live="polite">
                <span className="assistant-chat-status-dot" aria-hidden="true" />
                <span>{statusLabel}</span>
            </div>
        </header>
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
