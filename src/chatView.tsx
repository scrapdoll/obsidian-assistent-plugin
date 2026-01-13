import { StrictMode } from "react"
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from "react-dom/client"
export const VIEW_TYPE_EXAMPLE = 'example-view';


export const ChatView = () => {
    return <h1>Hello world</h1>
}

export class ExampleView extends ItemView {
    root: Root | null = null

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() {
        return VIEW_TYPE_EXAMPLE;
    }

    getDisplayText() {
        return 'Example view';
    }

    async onOpen() {
        this.root = createRoot(this.containerEl)
        this.root.render(
            <StrictMode>
                <ChatView />
            </StrictMode>
        )
    }

    async onClose() {
        this.root?.unmount();
    }
}