import { StrictMode } from "react";
import {
    ItemView,
    WorkspaceLeaf,
} from "obsidian";
import { createRoot, Root } from "react-dom/client";
import AcpClient from "acp/client";
import { ChatView } from "chat/ChatView";

export const VIEW_TYPE_EXAMPLE = "example-view";

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
