import type { KeyboardEvent } from "react";
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    ContentBlock,
    PermissionOption,
    RequestPermissionRequest,
    RequestPermissionResponse,
    SessionNotification,
    ToolCall,
    ToolCallUpdate
} from "@agentclientprotocol/sdk";
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

type PermissionRequestState = {
    id: string;
    request: RequestPermissionRequest;
    resolve: (response: RequestPermissionResponse) => void;
};

type ChatViewProps = {
    client: AcpClient;
};

const createMessageId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const formatErrorDetails = (data: unknown) => {
    if (data == null) {
        return "";
    }

    if (typeof data === "string") {
        return ` (${data})`;
    }

    try {
        const text = JSON.stringify(data);
        if (text.length > 300) {
            return ` (${text.slice(0, 300)}...)`;
        }
        return ` (${text})`;
    } catch (error) {
        return "";
    }
};

const isPromptParamError = (error: unknown) => {
    const asText = (value: unknown): string => {
        if (typeof value === "string") {
            return value;
        }

        if (!value || typeof value !== "object") {
            return "";
        }

        const seen = new WeakSet<object>();
        try {
            return JSON.stringify(value, (_key, val) => {
                if (val && typeof val === "object") {
                    if (seen.has(val)) {
                        return "[circular]";
                    }
                    seen.add(val);
                }
                return val;
            });
        } catch (stringifyError) {
            return "";
        }
    };

    const containsPromptParam = (value: unknown): boolean => {
        if (typeof value === "string") {
            return value.includes("prompt parameter");
        }

        if (!value || typeof value !== "object") {
            return false;
        }

        const message = (value as { message?: unknown }).message;
        if (typeof message === "string" && message.includes("prompt parameter")) {
            return true;
        }

        const details = (value as { details?: unknown }).details;
        if (typeof details === "string" && details.includes("prompt parameter")) {
            return true;
        }

        const blob = asText(value);
        if (blob && blob.includes("prompt parameter")) {
            return true;
        }

        return false;
    };

    if (containsPromptParam(error)) {
        return true;
    }

    let current: unknown = error;
    while (current && typeof current === "object") {
        const data = (current as { data?: unknown }).data;
        if (containsPromptParam(data)) {
            return true;
        }
        current = (data as { error?: unknown } | undefined)?.error;
    }

    return false;
};

const formatError = (error: unknown) => {
    if (error instanceof Error) {
        const maybeCode = (error as { code?: unknown }).code;
        const maybeData = (error as { data?: unknown }).data;
        const codeLabel =
            typeof maybeCode === "string" || typeof maybeCode === "number"
                ? ` [code ${maybeCode}]`
                : "";
        return `${error.message}${codeLabel}${formatErrorDetails(maybeData)}`;
    }

    if (error && typeof error === "object") {
        const maybeError = error as { message?: unknown; code?: unknown; data?: unknown };
        if (typeof maybeError.message === "string") {
            const codeLabel =
                typeof maybeError.code === "string" || typeof maybeError.code === "number"
                    ? ` [code ${maybeError.code}]`
                    : "";
            return `${maybeError.message}${codeLabel}${formatErrorDetails(maybeError.data)}`;
        }
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

const formatPermissionTitle = (request: RequestPermissionRequest) => {
    const title = request.toolCall.title ?? `Tool ${request.toolCall.toolCallId}`;
    const kind = request.toolCall.kind ? request.toolCall.kind.replace(/_/g, " ") : "other";
    return `${title} - ${kind}`;
};

const formatPermissionInput = (input: unknown): string | null => {
    if (input == null) {
        return null;
    }

    if (typeof input === "string") {
        return input;
    }

    if (typeof input === "number" || typeof input === "boolean") {
        return String(input);
    }

    try {
        const text = JSON.stringify(input, null, 2);
        if (text.length > 1200) {
            return `${text.slice(0, 1200)}...`;
        }
        return text;
    } catch (error) {
        return String(input);
    }
};

const getPermissionOptionTone = (option: PermissionOption) => {
    if (option.kind === "allow_once" || option.kind === "allow_always") {
        return "allow";
    }

    if (option.kind === "reject_once" || option.kind === "reject_always") {
        return "reject";
    }

    return "neutral";
};

export const ChatView = ({ client }: ChatViewProps) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [permissionQueue, setPermissionQueue] = useState<PermissionRequestState[]>([]);
    const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
    const activeAssistantIdRef = useRef<string | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const permissionQueueRef = useRef<PermissionRequestState[]>([]);

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
                    const next = [...prev];
                    const target = prev[index]!;
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
        permissionQueueRef.current = permissionQueue;
    }, [permissionQueue]);

    const enqueuePermissionRequest = useCallback((entry: PermissionRequestState) => {
        setPermissionQueue((prev) => {
            const next = [...prev, entry];
            permissionQueueRef.current = next;
            return next;
        });
    }, []);

    useEffect(() => {
        const unsubscribe = client.subscribePermissionRequests((request) => {
            return new Promise<RequestPermissionResponse>((resolve) => {
                const entry: PermissionRequestState = {
                    id: createMessageId("permission"),
                    request,
                    resolve
                };
                enqueuePermissionRequest(entry);
            });
        });

        return () => {
            unsubscribe();
            for (const pending of permissionQueueRef.current) {
                pending.resolve({ outcome: { outcome: "cancelled" } });
            }
            permissionQueueRef.current = [];
        };
    }, [client, enqueuePermissionRequest]);

    useEffect(() => {
        scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, isSending, permissionQueue.length]);

    const resolvePermissionRequest = useCallback(
        (outcome: RequestPermissionResponse["outcome"]) => {
            setPermissionQueue((prev) => {
                const current = prev[0];
                if (!current) {
                    return prev;
                }

                const rest = prev.slice(1);
                current.resolve({ outcome });
                permissionQueueRef.current = rest;
                return rest;
            });
        },
        []
    );

    const handlePermissionSelect = useCallback(
        (option: PermissionOption) => {
            resolvePermissionRequest({ outcome: "selected", optionId: option.optionId });
            appendMessage("system", `Permission selected: ${option.name}`);
        },
        [appendMessage, resolvePermissionRequest]
    );

    const handlePermissionCancel = useCallback(() => {
        resolvePermissionRequest({ outcome: "cancelled" });
        appendMessage("system", "Permission request cancelled.");
    }, [appendMessage, resolvePermissionRequest]);

    const activePermission = permissionQueue[0] ?? null;
    const pendingPermissionCount = Math.max(permissionQueue.length - 1, 0);
    const activePermissionInput = activePermission
        ? formatPermissionInput(activePermission.request.toolCall.rawInput)
        : null;

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isSending) {
            return;
        }

        setError(null);
        activeAssistantIdRef.current = null;
        appendMessage("user", trimmed);
        setIsSending(true);

        try {
            await client.sendPrompt(trimmed);
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
                {activePermission ? (
                    <div className="assistant-chat-permission">
                        <div className="assistant-chat-permission-header">
                            <div>
                                <div className="assistant-chat-permission-title">
                                    Permission required
                                </div>
                                <div className="assistant-chat-permission-meta">
                                    {formatPermissionTitle(activePermission.request)}
                                </div>
                                <div className="assistant-chat-permission-id">
                                    Tool call ID: {activePermission.request.toolCall.toolCallId}
                                </div>
                            </div>
                            {pendingPermissionCount > 0 ? (
                                <div className="assistant-chat-permission-queue">
                                    {pendingPermissionCount} more pending
                                </div>
                            ) : null}
                        </div>
                        {activePermissionInput ? (
                            <pre className="assistant-chat-permission-input">
                                {activePermissionInput}
                            </pre>
                        ) : null}
                        <div className="assistant-chat-permission-options">
                            {activePermission.request.options.map((option) => {
                                const tone = getPermissionOptionTone(option);
                                const toneClass =
                                    tone === "neutral" ? "" : ` is-${tone}`;
                                return (
                                    <button
                                        key={option.optionId}
                                        className={`assistant-chat-permission-option${toneClass}`}
                                        type="button"
                                        onClick={() => handlePermissionSelect(option)}
                                    >
                                        {option.name}
                                    </button>
                                );
                            })}
                            <button
                                className="assistant-chat-permission-option is-cancel"
                                type="button"
                                onClick={handlePermissionCancel}
                            >
                                Cancel request
                            </button>
                        </div>
                    </div>
                ) : null}
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

export class AssistantChatView extends ItemView {
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
