import { memo } from "react";
import type {
    PermissionOption,
    RequestPermissionRequest,
} from "@agentclientprotocol/sdk";
import {
    formatPermissionTitle,
    getPermissionOptionTone,
    formatPermissionInput,
} from "../utils";

interface PermissionPromptProps {
    request: RequestPermissionRequest;
    pendingCount: number;
    onSelect: (option: PermissionOption) => void;
    onCancel: () => void;
}

export const PermissionPrompt = memo(function PermissionPrompt({
    request,
    pendingCount,
    onSelect,
    onCancel,
}: PermissionPromptProps) {
    const activePermissionInput = formatPermissionInput(request.toolCall.rawInput);

    return (
        <div className="assistant-chat-permission">
            <div className="assistant-chat-permission-header">
                <div>
                    <div className="assistant-chat-permission-title">
                        Permission required
                    </div>
                    <div className="assistant-chat-permission-meta">
                        {formatPermissionTitle(request)}
                    </div>
                    <div className="assistant-chat-permission-id">
                        Tool call ID: {request.toolCall.toolCallId}
                    </div>
                </div>
                {pendingCount > 0 ? (
                    <div className="assistant-chat-permission-queue">
                        {pendingCount} more pending
                    </div>
                ) : null}
            </div>
            {activePermissionInput ? (
                <pre className="assistant-chat-permission-input">
                    {activePermissionInput}
                </pre>
            ) : null}
            <div className="assistant-chat-permission-options">
                {request.options.map((option) => {
                    const tone = getPermissionOptionTone(option);
                    const toneClass = tone === "neutral" ? "" : ` is-${tone}`;
                    return (
                        <button
                            key={option.optionId}
                            className={`assistant-chat-permission-option${toneClass}`}
                            type="button"
                            onClick={() => onSelect(option)}
                        >
                            {option.name}
                        </button>
                    );
                })}
                <button
                    className="assistant-chat-permission-option is-cancel"
                    type="button"
                    onClick={onCancel}
                >
                    Cancel request
                </button>
            </div>
        </div>
    );
});
