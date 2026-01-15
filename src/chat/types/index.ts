import type {
    RequestPermissionRequest,
    RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type AcpClient from "acp/client";
import type { App } from "obsidian";

export type ChatMessageRole = "assistant" | "user" | "system";

export type ChatMessage = {
    id: string;
    role: ChatMessageRole;
    content: string;
};

export type AttachmentSource = "auto" | "manual";

export type Attachment = {
    id: string;
    path: string;
    name: string;
    size: number;
    kind: "text" | "binary";
    mode: "inline" | "reference";
    content?: string;
    source: AttachmentSource;
};

export type PermissionRequestState = {
    id: string;
    request: RequestPermissionRequest;
    resolve: (response: RequestPermissionResponse) => void;
};

export type ChatViewProps = {
    client: AcpClient;
    app: App;
};
