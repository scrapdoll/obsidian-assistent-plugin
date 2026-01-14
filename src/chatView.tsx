import type { KeyboardEvent } from "react";
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContentBlock, SessionNotification, ToolCall, ToolCallUpdate } from "@agentclientprotocol/sdk";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import AcpClient from "acp/client";

export const VIEW_TYPE_EXAMPLE = "example-view";

type ChatMessageRole = "assistant" | "user" | "system";

type ChatMessage = {
    id: string;
    role: ChatMessageRole;
    content: string;
};

type ChatViewProps = {
    client: AcpClient;
};

const createMessageId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const formatError = (error: unknown) => {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
};

const contentToText = (content: ContentBlock): string => {
    if (content.type === "text") {
        return content.text;
    }

    if (content.type === "resource_link") {
        return `Resource: ${content.title ?? content.name ?? content.uri}`;
    }

    if (content.type === "resource") {
        if ("text" in content.resource) {
            return content.resource.text;
        }

        return `Resource: ${content.resource.uri}`;
    }

    return `[${content.type} content]`;
};

const describeToolCall = (prefix: string, toolCall: ToolCall | ToolCallUpdate) => {
    const title = toolCall.title ?? `Tool ${toolCall.toolCallId}`;
    const status = toolCall.status ? ` (${toolCall.status})` : "";
    return `${prefix}: ${title}${status}`;
};

export const ChatView = ({ client }: ChatViewProps) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
    const activeAssistantIdRef = useRef<string | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);

    const appendMessage = useCallback((role: ChatMessageRole, content: string) => {
        setMessages((prev) => [
            ...prev,
            {
                id: createMessageId(role),
                role,
                content
            }
        ]);
    }, []);

    const appendAssistantText = useCallback((text: string) => {
        if (!text) {
            return;
        }

        setMessages((prev) => {
            const activeId = activeAssistantIdRef.current;
            if (activeId) {
                const index = prev.findIndex((message) => message.id === activeId);
                if (index !== -1) {
                    const target = prev[index];
                    if (!target) {
                        return prev;
                    }

                    const next = [...prev];
                    next[index] = { ...target, content: target.content + text };
                    return next;
                }
            }

            const id = createMessageId("assistant");
            activeAssistantIdRef.current = id;
            return [...prev, { id, role: "assistant", content: text }];
        });
    }, []);

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
        inputRef.current?.focus();

        return () => {
            isActive = false;
        };
    }, [appendMessage, client]);

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
    }, [appendAssistantText, appendMessage, client]);

    useEffect(() => {
        scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, isSending]);

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isSending) {
            return;
        }

        setInput("");
        setError(null);
        activeAssistantIdRef.current = null;
        appendMessage("user", trimmed);
        setIsSending(true);

        try {
            await client.sendPrompt(trimmed);
        } catch (err) {
            const message = formatError(err);
            setError(message);
            appendMessage("system", `Prompt error: ${message}`);
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void handleSend();
        }
    };

    const statusLabel = useMemo(() => {
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
    }, [isSending, status]);

    const statusTone = useMemo(() => {
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
    }, [isSending, status]);

    return (
        <div className="assistant-chat-root">
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
            <div className="assistant-chat-messages">
                {messages.length === 0 ? (
                    <div className="assistant-chat-empty">
                        Start a conversation to see responses here.
                    </div>
                ) : null}
                {messages.map((message) => (
                    <div key={message.id} className={`assistant-chat-message ${message.role}`}>
                        {message.content}
                    </div>
                ))}
                {error ? <div className="assistant-chat-error">{error}</div> : null}
                <div ref={scrollAnchorRef} />
            </div>
            <form
                className="assistant-chat-input"
                onSubmit={(event) => {
                    event.preventDefault();
                    void handleSend();
                }}
            >
                <textarea
                    ref={inputRef}
                    className="assistant-chat-textarea"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask the assistant"
                    rows={1}
                />
                <button
                    className="assistant-chat-send"
                    type="submit"
                    disabled={isSending || status === "connecting"}
                >
                    Send
                </button>
            </form>
        </div>
    );
};

export class AssistentChatView extends ItemView {
    root: Root | null = null;
    private clientProvider: () => AcpClient;

    constructor(leaf: WorkspaceLeaf, clientProvider: () => AcpClient) {
        super(leaf);
        this.clientProvider = clientProvider;
    }

    getViewType() {
        return VIEW_TYPE_EXAMPLE;
    }

    getDisplayText() {
        return "Assistant";
    }

    async onOpen() {
        this.containerEl.empty();
        const rootEl = this.containerEl.createDiv({ cls: "assistant-chat-view" });
        this.root = createRoot(rootEl);
        const client = this.clientProvider();
        this.root.render(
            <StrictMode>
                <ChatView client={client} />
            </StrictMode>
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}
