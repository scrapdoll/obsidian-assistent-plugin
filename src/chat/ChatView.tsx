import { useCallback, useEffect, useRef, useState } from "react";
import type {
    SessionNotification,
} from "@agentclientprotocol/sdk";
import type { App } from "obsidian";
import type AcpClient from "acp/client";

import type { ChatViewProps } from "./types";
import { useMessages } from "./hooks";
import { usePermissions } from "./hooks";
import { useAttachments } from "./hooks";
import { useDragDrop } from "./hooks";

import {
    describeToolCall,
    contentToText,
    formatError,
    isPromptParamError,
} from "./utils";

import { ChatHeader } from "./components";
import { ChatMessages } from "./components";
import { PermissionPrompt } from "./components";
import { ChatInput } from "./components";
import { ChatError } from "./components";

export const ChatView = ({ client, app }: ChatViewProps) => {
    const { messages, appendMessage, appendAssistantText, resetActiveAssistant } = useMessages();
    const { activePermission, pendingPermissionCount, handlePermissionSelect, handlePermissionCancel } =
        usePermissions({ client, onMessage: appendMessage });
    const {
        attachments,
        addAttachmentsFromPaths,
        handleAttachmentRemove,
        handleAttachClick,
        buildPromptBlocks,
        ensureAutoAttachment,
    } = useAttachments({ app, onMessage: appendMessage });
    const { isDragActive, handleDrop, handleDragOver, handleDragLeave, dragHandlers } =
        useDragDrop({ onDropPaths: addAttachmentsFromPaths });

    const [input, setInput] = useState("");
    const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

    const handleSend = useCallback(async () => {
        const trimmed = input.trim();
        if ((!trimmed && attachments.length === 0) || isSending) {
            return;
        }

        setError(null);
        resetActiveAssistant();
        if (trimmed) {
            appendMessage("user", trimmed);
        } else {
            const summary = attachments.map((item) => item.name).join(", ");
            appendMessage("user", `Attached: ${summary}`);
        }
        setIsSending(true);

        try {
            const prompt = await buildPromptBlocks(trimmed, attachments);
            await client.sendPrompt(prompt);
            setInput("");
        } catch (err) {
            setInput(trimmed);
            const message = formatError(err);
            if (isPromptParamError(err) || message.includes("prompt parameter")) {
                console.warn("Prompt parameter error", err);
                return;
            }
            setError(message);
            appendMessage("system", `Prompt error: ${message}`);
        } finally {
            setIsSending(false);
        }
    }, [input, attachments, isSending, appendMessage, buildPromptBlocks, client]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void handleSend();
        }
    }, [handleSend]);

    useEffect(() => {
        let isActive = true;

        const init = async () => {
            setStatus("connecting");
            setError(null);
            try {
                await client.ensureSession();
                if (!isActive) {
                    return;
                }
                setStatus("ready");
            } catch (err) {
                if (!isActive) {
                    return;
                }
                const message = formatError(err);
                setStatus("error");
                setError(message);
                appendMessage("system", `Connection error: ${message}`);
            }
        };

        void init();

        return () => {
            isActive = false;
        };
    }, [appendMessage, client]);

    useEffect(() => {
        void ensureAutoAttachment();
        const ref = app.workspace.on("file-open", () => {
            void ensureAutoAttachment();
        });

        return () => {
            app.workspace.offref(ref);
        };
    }, [app, ensureAutoAttachment]);

    useEffect(() => {
        const handleSessionUpdate = (notification: SessionNotification) => {
            const update = notification.update;
            switch (update.sessionUpdate) {
                case "agent_message_chunk": {
                    appendAssistantText(contentToText(update.content));
                    break;
                }
                case "agent_thought_chunk": {
                    const thought = contentToText(update.content);
                    appendMessage("system", `Thought: ${thought}`);
                    break;
                }
                case "tool_call": {
                    appendMessage("system", describeToolCall("Tool call", update));
                    break;
                }
                case "tool_call_update": {
                    appendMessage("system", describeToolCall("Tool update", update));
                    break;
                }
                case "current_mode_update": {
                    appendMessage("system", `Mode: ${update.currentModeId}`);
                    break;
                }
                case "available_commands_update": {
                    appendMessage(
                        "system",
                        `Commands available: ${update.availableCommands.length}`
                    );
                    break;
                }
                case "config_option_update": {
                    appendMessage("system", "Config updated.");
                    break;
                }
                case "session_info_update": {
                    if (update.title) {
                        appendMessage("system", `Session title: ${update.title}`);
                    }
                    break;
                }
                case "plan": {
                    appendMessage("system", "Plan updated.");
                    break;
                }
                case "user_message_chunk": {
                    break;
                }
                default: {
                    break;
                }
            }
        };

        const unsubscribe = client.subscribeSessionUpdates(handleSessionUpdate);
        return () => {
            unsubscribe();
        };
    }, [appendMessage, appendAssistantText, client]);

    useEffect(() => {
        scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, isSending, activePermission]);

    return (
        <div className="assistant-chat-root" {...dragHandlers}>
            <ChatHeader status={status} isSending={isSending} />
            <ChatMessages messages={messages}>
                {activePermission && (
                    <PermissionPrompt
                        request={activePermission.request}
                        pendingCount={pendingPermissionCount}
                        onSelect={handlePermissionSelect}
                        onCancel={handlePermissionCancel}
                    />
                )}
                {error && <ChatError message={error} />}
                <div ref={scrollAnchorRef} />
            </ChatMessages>
            <ChatInput
                input={input}
                isSending={isSending}
                isDragActive={isDragActive}
                attachments={attachments}
                onAttachmentRemove={handleAttachmentRemove}
                onInputChange={setInput}
                onAttach={handleAttachClick}
                onSend={handleSend}
                onKeyDown={handleKeyDown}
            />
        </div>
    );
};
