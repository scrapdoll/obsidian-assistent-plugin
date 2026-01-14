import type { DragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
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
import {
    App,
    FileSystemAdapter,
    FuzzySuggestModal,
    ItemView,
    TFile,
    WorkspaceLeaf,
    normalizePath
} from "obsidian";
import { createRoot, Root } from "react-dom/client";
import AcpClient from "acp/client";

export const VIEW_TYPE_EXAMPLE = "example-view";

type ChatMessageRole = "assistant" | "user" | "system";

type ChatMessage = {
    id: string;
    role: ChatMessageRole;
    content: string;
};

type AttachmentSource = "auto" | "manual";

type Attachment = {
    id: string;
    path: string;
    name: string;
    size: number;
    kind: "text" | "binary";
    mode: "inline" | "reference";
    content?: string;
    source: AttachmentSource;
};

type PermissionRequestState = {
    id: string;
    request: RequestPermissionRequest;
    resolve: (response: RequestPermissionResponse) => void;
};

type ChatViewProps = {
    client: AcpClient;
    app: App;
};

const INLINE_ATTACHMENT_LIMIT = 300 * 1024;

const TEXT_EXTENSIONS = new Set([
    "md",
    "mdx",
    "txt",
    "json",
    "yaml",
    "yml",
    "toml",
    "ini",
    "conf",
    "log",
    "csv",
    "ts",
    "tsx",
    "js",
    "jsx",
    "mjs",
    "cjs",
    "css",
    "scss",
    "html",
    "xml",
    "sh",
    "py",
    "rb",
    "go",
    "rs",
    "java",
    "kt",
    "swift",
    "c",
    "cpp",
    "h",
    "hpp",
    "cs",
    "php",
    "sql"
]);

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

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");

const getVaultBasePath = (app: App): string | null => {
    const adapter = app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
        return normalizeSlashes(adapter.getBasePath());
    }

    return null;
};

const toVaultRelativePath = (app: App, inputPath: string): string | null => {
    const normalized = normalizeSlashes(inputPath);
    const basePath = getVaultBasePath(app);

    if (basePath) {
        const trimmedBase = basePath.replace(/\/+$/, "");
        if (normalized === trimmedBase) {
            return "";
        }
        if (normalized.startsWith(`${trimmedBase}/`)) {
            return normalizePath(normalized.slice(trimmedBase.length + 1));
        }
    }

    if (!normalized.startsWith("/")) {
        return normalizePath(normalized.replace(/^\/+/, ""));
    }

    return null;
};

const encodeVaultPath = (path: string) =>
    path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

const toVaultUri = (path: string) => `vault:///${encodeVaultPath(path)}`;

const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes)) {
        return "";
    }

    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }

    const decimals = value >= 10 || index === 0 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[index]}`;
};

const resolveObsidianOpenUrl = (app: App, candidate: string): TFile | null => {
    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        return null;
    }

    if (url.protocol !== "obsidian:" || url.hostname !== "open") {
        return null;
    }

    const vaultName = url.searchParams.get("vault");
    if (vaultName && vaultName !== app.vault.getName()) {
        return null;
    }

    const fileParam = url.searchParams.get("file");
    if (!fileParam) {
        return null;
    }

    const decoded = decodeURIComponent(fileParam);
    const normalized = normalizePath(decoded);

    const exact = app.vault.getFileByPath(normalized);
    if (exact) {
        return exact;
    }

    const resolved = app.metadataCache.getFirstLinkpathDest(decoded, "");
    if (resolved) {
        return resolved;
    }

    if (!normalized.endsWith(".md")) {
        return app.vault.getFileByPath(`${normalized}.md`);
    }

    return null;
};

const isTextFile = (file: TFile) => {
    const ext = file.extension.toLowerCase();
    if (!ext) {
        return true;
    }
    return TEXT_EXTENSIONS.has(ext);
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

export const ChatView = ({ client, app }: ChatViewProps) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [permissionQueue, setPermissionQueue] = useState<PermissionRequestState[]>([]);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isDragActive, setIsDragActive] = useState(false);
    const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
    const activeAssistantIdRef = useRef<string | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const permissionQueueRef = useRef<PermissionRequestState[]>([]);
    const attachmentsRef = useRef<Attachment[]>([]);
    const autoAttachSuppressedRef = useRef(false);

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
        attachmentsRef.current = attachments;
    }, [attachments]);

    const buildAttachment = useCallback(
        async (file: TFile, source: AttachmentSource): Promise<Attachment> => {
            const size = file.stat.size;
            const textFile = isTextFile(file);
            let mode: Attachment["mode"] =
                textFile && size <= INLINE_ATTACHMENT_LIMIT ? "inline" : "reference";
            let content: string | undefined;

            if (mode === "inline") {
                try {
                    content = await app.vault.read(file);
                } catch (error) {
                    mode = "reference";
                    appendMessage(
                        "system",
                        `Attachment read failed for ${file.path}: ${formatError(error)}`
                    );
                }
            }

            return {
                id: createMessageId("attachment"),
                path: file.path,
                name: file.name,
                size,
                kind: textFile ? "text" : "binary",
                mode,
                content,
                source
            };
        },
        [app, appendMessage]
    );

    const addAttachmentFromFile = useCallback(
        async (file: TFile, source: AttachmentSource) => {
            if (attachmentsRef.current.some((attachment) => attachment.path === file.path)) {
                return;
            }

            const attachment = await buildAttachment(file, source);
            setAttachments((prev) => {
                if (prev.some((item) => item.path === attachment.path)) {
                    return prev;
                }
                return [...prev, attachment];
            });
        },
        [buildAttachment]
    );

    const resolveDropPath = useCallback(
        (candidate: string): TFile | null => {
            if (candidate.startsWith("obsidian://")) {
                return resolveObsidianOpenUrl(app, candidate);
            }

            const relativePath = toVaultRelativePath(app, candidate);
            if (!relativePath) {
                return null;
            }

            const file = app.vault.getAbstractFileByPath(relativePath);
            return file instanceof TFile ? file : null;
        },
        [app]
    );

    const addAttachmentsFromPaths = useCallback(
        async (paths: string[]) => {
            for (const path of paths) {
                const file = resolveDropPath(path);
                if (!file) {
                    appendMessage("system", `Skipped non-vault file: ${path}`);
                    continue;
                }
                await addAttachmentFromFile(file, "manual");
            }
        },
        [addAttachmentFromFile, appendMessage, resolveDropPath]
    );

    const extractDropPaths = (data: DataTransfer) => {
        const paths: string[] = [];

        for (const file of Array.from(data.files)) {
            const filePath = (file as { path?: string }).path;
            if (filePath) {
                paths.push(filePath);
            }
        }

        const text = data.getData("text/plain");
        if (text) {
            for (const line of text.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (trimmed) {
                    paths.push(trimmed);
                }
            }
        }

        const uriList = data.getData("text/uri-list");
        if (uriList) {
            for (const line of uriList.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) {
                    continue;
                }
                if (trimmed.startsWith("file://")) {
                    paths.push(decodeURI(trimmed.replace("file://", "")));
                } else {
                    paths.push(trimmed);
                }
            }
        }

        return Array.from(new Set(paths));
    };

    const ensureAutoAttachment = useCallback(async () => {
        if (autoAttachSuppressedRef.current) {
            return;
        }

        const file = app.workspace.getActiveFile();
        if (!file) {
            setAttachments((prev) => prev.filter((item) => item.source !== "auto"));
            return;
        }

        const existingAuto = attachmentsRef.current.find(
            (attachment) => attachment.source === "auto"
        );
        const hasManualForActive = attachmentsRef.current.some(
            (attachment) =>
                attachment.source !== "auto" && attachment.path === file.path
        );
        if (existingAuto?.path === file.path) {
            return;
        }
        if (hasManualForActive) {
            if (existingAuto) {
                setAttachments((prev) => prev.filter((item) => item.source !== "auto"));
            }
            return;
        }

        const attachment = await buildAttachment(file, "auto");
        setAttachments((prev) => {
            const withoutAuto = prev.filter((item) => item.source !== "auto");
            if (withoutAuto.some((item) => item.path === attachment.path)) {
                return withoutAuto;
            }
            return [...withoutAuto, attachment];
        });
    }, [app, buildAttachment]);

    const buildPromptBlocks = useCallback(
        async (text: string, currentAttachments: Attachment[]) => {
            const blocks: ContentBlock[] = [];
            const trimmed = text.trim();

            if (trimmed) {
                blocks.push({ type: "text", text: trimmed });
            } else if (currentAttachments.length > 0) {
                blocks.push({ type: "text", text: "Attached files." });
            }

            for (const attachment of currentAttachments) {
                const uri = toVaultUri(attachment.path);

                if (attachment.mode === "inline") {
                    let content = attachment.content;
                    if (content == null) {
                        const file = app.vault.getAbstractFileByPath(attachment.path);
                        if (file instanceof TFile) {
                            try {
                                content = await app.vault.read(file);
                            } catch (error) {
                                appendMessage(
                                    "system",
                                    `Attachment read failed for ${attachment.path}: ${formatError(
                                        error
                                    )}`
                                );
                                blocks.push({
                                    type: "resource_link",
                                    uri,
                                    name: attachment.name,
                                    title: attachment.path
                                });
                                continue;
                            }
                        }
                    }

                    if (content == null) {
                        blocks.push({
                            type: "resource_link",
                            uri,
                            name: attachment.name,
                            title: attachment.path
                        });
                        continue;
                    }

                    blocks.push({
                        type: "resource",
                        resource: {
                            uri,
                            text: content
                        }
                    });
                    continue;
                }

                blocks.push({
                    type: "resource_link",
                    uri,
                    name: attachment.name,
                    title: attachment.path
                });
            }

            return blocks;
        },
        [app, appendMessage]
    );

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

    const handleAttachmentRemove = useCallback((id: string) => {
        setAttachments((prev) => {
            const target = prev.find((attachment) => attachment.id === id);
            if (target?.source === "auto") {
                autoAttachSuppressedRef.current = true;
            }
            return prev.filter((attachment) => attachment.id !== id);
        });
    }, []);

    const handleAttachClick = useCallback(() => {
        const modal = new AttachmentFileModal(app, (file) => {
            void addAttachmentFromFile(file, "manual");
        });
        modal.open();
    }, [addAttachmentFromFile, app]);

    const handleDrop = useCallback(
        (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setIsDragActive(false);

            const data = event.dataTransfer;
            if (!data) {
                return;
            }

            const paths = extractDropPaths(data);
            if (paths.length === 0) {
                return;
            }

            void addAttachmentsFromPaths(paths);
        },
        [addAttachmentsFromPaths]
    );

    const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragActive(true);
    }, []);

    const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
        if (event.currentTarget === event.target) {
            setIsDragActive(false);
        }
    }, []);

    const activePermission = permissionQueue[0] ?? null;
    const pendingPermissionCount = Math.max(permissionQueue.length - 1, 0);
    const activePermissionInput = activePermission
        ? formatPermissionInput(activePermission.request.toolCall.rawInput)
        : null;

    const handleSend = async () => {
        const trimmed = input.trim();
        const currentAttachments = attachmentsRef.current;
        if ((!trimmed && currentAttachments.length === 0) || isSending) {
            return;
        }

        setError(null);
        activeAssistantIdRef.current = null;
        if (trimmed) {
            appendMessage("user", trimmed);
        } else {
            const summary = currentAttachments.map((item) => item.name).join(", ");
            appendMessage("user", `Attached: ${summary}`);
        }
        setIsSending(true);

        try {
            const prompt = await buildPromptBlocks(trimmed, currentAttachments);
            await client.sendPrompt(prompt);
            setInput("");
            setAttachments([]);
            attachmentsRef.current = [];
            autoAttachSuppressedRef.current = false;
            void ensureAutoAttachment();
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

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
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
                {attachments.length > 0 ? (
                    <div className="assistant-chat-attachments">
                        {attachments.map((attachment) => {
                            const modeLabel =
                                attachment.mode === "inline" ? "inline" : "link";
                            const sourceLabel =
                                attachment.source === "auto" ? "active file" : "";
                            const metaBits = [
                                formatBytes(attachment.size),
                                modeLabel,
                                sourceLabel
                            ].filter(Boolean);
                            return (
                                <div
                                    key={attachment.id}
                                    className={`assistant-chat-attachment is-${attachment.source}`}
                                >
                                    <div className="assistant-chat-attachment-main">
                                        <div className="assistant-chat-attachment-name">
                                            {attachment.name}
                                        </div>
                                        <div className="assistant-chat-attachment-meta">
                                            {metaBits.join(" · ")}
                                        </div>
                                    </div>
                                    <button
                                        className="assistant-chat-attachment-remove"
                                        type="button"
                                        onClick={() =>
                                            handleAttachmentRemove(attachment.id)
                                        }
                                    >
                                        Remove
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
                <div
                    className={`assistant-chat-input-row${
                        isDragActive ? " is-drop" : ""
                    }`}
                    onDragEnter={handleDragOver}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <button
                        className="assistant-chat-attach"
                        type="button"
                        onClick={handleAttachClick}
                    >
                        Attach
                    </button>
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
                        disabled={
                            isSending ||
                            status === "connecting" ||
                            (!input.trim() && attachments.length === 0)
                        }
                    >
                        Send
                    </button>
                </div>
            </form>
        </div>
    );
};

class AttachmentFileModal extends FuzzySuggestModal<TFile> {
    private onChoose: (file: TFile) => void;

    constructor(app: App, onChoose: (file: TFile) => void) {
        super(app);
        this.onChoose = onChoose;
    }

    getItems(): TFile[] {
        return this.app.vault.getFiles();
    }

    getItemText(item: TFile): string {
        return item.path;
    }

    onChooseItem(item: TFile, _evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
}

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
                <ChatView client={client} app={this.app} />
            </StrictMode>
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}
