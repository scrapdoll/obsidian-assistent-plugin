import { useCallback, useEffect, useRef, useState } from "react";
import { App, TFile, Modal } from "obsidian";
import type { ContentBlock } from "@agentclientprotocol/sdk";
import type { Attachment, AttachmentSource, ChatMessageRole } from "../types";

class FileSelectModal extends Modal {
    constructor(
        app: App,
        private files: TFile[],
        private onSelect: (file: TFile) => void
    ) {
        super(app);
    }

    onOpen() {
        this.createContent();
    }

    private createContent() {
        const { contentEl } = this;
        contentEl.empty();

        const listContainer = contentEl.createDiv({ cls: "assistant-file-list" });
        const list = listContainer.createEl("ul", { cls: "assistant-file-list-items" });

        for (const file of this.files) {
            const item = list.createEl("li", { cls: "assistant-file-list-item" });
            item.textContent = file.path;
            item.addEventListener('click', () => {
                this.onSelect(file);
                this.close();
            });
        }
    }
}

import {
    createMessageId,
    formatError,
    isTextFile,
    INLINE_ATTACHMENT_LIMIT,
    resolveObsidianOpenUrl,
    toVaultRelativePath,
    toVaultUri,
} from "../utils";

interface UseAttachmentsProps {
    app: App;
    onMessage: (role: ChatMessageRole, content: string) => void;
}

export const useAttachments = ({ app, onMessage }: UseAttachmentsProps) => {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const attachmentsRef = useRef<Attachment[]>([]);
    const autoAttachSuppressedRef = useRef(false);
    const autoAttachRequestIdRef = useRef(0);

    useEffect(() => {
        attachmentsRef.current = attachments;
    }, [attachments]);

    const buildAttachment = useCallback(
        async (file: TFile, source: AttachmentSource): Promise<Attachment> => {
            const size = file.stat.size;
            const textFile = isTextFile(file);

            if (textFile && size <= INLINE_ATTACHMENT_LIMIT) {
                try {
                    const content = await app.vault.read(file);
                    return {
                        id: createMessageId("attachment"),
                        path: file.path,
                        name: file.name,
                        size,
                        kind: textFile ? "text" : "binary",
                        mode: "inline",
                        content,
                        source
                    };
                } catch (error) {
                    onMessage(
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
                mode: "reference",
                source
            };
        },
        [app, onMessage]
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
                    onMessage("system", `Skipped non-vault file: ${path}`);
                    continue;
                }
                await addAttachmentFromFile(file, "manual");
            }
        },
        [addAttachmentFromFile, onMessage, resolveDropPath]
    );

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

        const requestId = ++autoAttachRequestIdRef.current;
        const attachment = await buildAttachment(file, "auto");
        if (autoAttachRequestIdRef.current !== requestId) {
            return;
        }

        const activeFile = app.workspace.getActiveFile();
        if (!activeFile || activeFile.path !== attachment.path) {
            return;
        }

        const hasManualForActiveNow = attachmentsRef.current.some(
            (item) => item.source !== "auto" && item.path === attachment.path
        );
        if (hasManualForActiveNow) {
            return;
        }

        setAttachments((prev) => {
            const withoutAuto = prev.filter((item) => item.source !== "auto");
            if (withoutAuto.some((item) => item.path === attachment.path)) {
                return withoutAuto;
            }
            return [...withoutAuto, attachment];
        });
    }, [app, buildAttachment]);

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
        const modal = new FileSelectModal(app, app.vault.getFiles(), (file: TFile) => {
            void addAttachmentFromFile(file, "manual");
        });
        modal.open();
    }, [addAttachmentFromFile, app]);

    const buildPromptBlocks = useCallback(
        async (text: string, currentAttachments: Attachment[]): Promise<ContentBlock[]> => {
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
                    blocks.push({
                        type: "resource",
                        resource: {
                            uri,
                            text: attachment.content
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
        []
    );

    return {
        attachments,
        addAttachmentFromFile,
        addAttachmentsFromPaths,
        ensureAutoAttachment,
        handleAttachmentRemove,
        handleAttachClick,
        buildPromptBlocks,
        buildAttachment,
        resolveDropPath
    };
};
