import { useCallback, useEffect, useRef, useState } from "react";
import type { App } from "obsidian";
import { MarkdownView } from "obsidian";
import type { Editor } from "obsidian";
import { MAX_SELECTION_SIZE } from "../constants";
import { createMessageId } from "../utils";
import type { SelectionAttachment } from "../types";

export interface UseSelectedTextProps {
    app: App;
    onSelectionChange?: (selection: SelectionAttachment | null) => void;
}

export interface UseSelectedTextReturn {
    currentSelection: SelectionAttachment | null;
    clearSelection: () => void;
}

const extractSelection = (editor: import("obsidian").Editor): string | null => {
    const selection = editor.getSelection();
    if (!selection) return null;
    return selection.trim() || null;
};

const createSelectionAttachment = (
    app: App,
    text: string
): SelectionAttachment | null => {
    if (text.length > MAX_SELECTION_SIZE) {
        return null;
    }

    const file = app.workspace.getActiveFile();
    const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    const from = editor?.getCursor("from");
    const to = editor?.getCursor("to");

    return {
        id: createMessageId("selection"),
        kind: "selection",
        content: text,
        charCount: text.length,
        filePath: file?.path || "",
        lineStart: from?.line || 0,
        lineEnd: to?.line || 0,
    };
};

export const useSelectedText = ({
    app,
    onSelectionChange,
}: UseSelectedTextProps): UseSelectedTextReturn => {
    const [currentSelection, setCurrentSelection] = useState<SelectionAttachment | null>(null);
    const lastValidSelectionRef = useRef<SelectionAttachment | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeViewRef = useRef<MarkdownView | null>(null);

    const handleSelectionChange = useCallback(() => {
        const activeView = app.workspace.getActiveViewOfType(MarkdownView);
        console.log("[useSelectedText] handleSelectionChange called, activeView:", !!activeView);

        const selectedText = activeView?.editor ? extractSelection(activeView.editor) : null;
        console.log("[useSelectedText] extracted text:", selectedText ? selectedText.substring(0, 50) + "..." : null);

        if (selectedText) {
            const attachment = createSelectionAttachment(app, selectedText);
            console.log("[useSelectedText] created attachment:", attachment);
            if (attachment) {
                lastValidSelectionRef.current = attachment;
                setCurrentSelection(attachment);
                onSelectionChange?.(attachment);
            }
        } else if (activeView?.editor) {
            console.log("[useSelectedText] Editor active but no selection, checking file");
            const currentFile = app.workspace.getActiveFile();
            const lastFile = lastValidSelectionRef.current?.filePath;

            if (lastValidSelectionRef.current && currentFile?.path === lastFile) {
                console.log("[useSelectedText] File unchanged, keeping selection");
                return;
            }

            console.log("[useSelectedText] File changed or no previous selection, clearing");
            lastValidSelectionRef.current = null;
            setCurrentSelection(null);
            onSelectionChange?.(null);
        } else {
            console.log("[useSelectedText] No active MarkdownView editor, keeping current selection:", lastValidSelectionRef.current);
        }
    }, [app, onSelectionChange]);

    const clearSelection = useCallback(() => {
        console.log("[useSelectedText] clearSelection called");
        lastValidSelectionRef.current = null;
        setCurrentSelection(null);
        onSelectionChange?.(null);
    }, [onSelectionChange]);

    useEffect(() => {
        const handleEditorChange = (...data: unknown[]) => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
                handleSelectionChange();
            }, 200);
        };

        const handleFileOpen = () => {
            console.log("[useSelectedText] File opened, checking if selection should be cleared");
            const lastFile = lastValidSelectionRef.current?.filePath;
            const currentFile = app.workspace.getActiveFile()?.path;

            if (lastFile && currentFile && lastFile !== currentFile) {
                console.log("[useSelectedText] File changed from", lastFile, "to", currentFile, ", clearing selection");
                lastValidSelectionRef.current = null;
                setCurrentSelection(null);
                onSelectionChange?.(null);
            } else {
                console.log("[useSelectedText] File unchanged or no previous selection, keeping selection");
            }
        };

        const handleActiveLeafChange = () => {
            console.log("[useSelectedText] Active leaf changed");
            const activeFile = app.workspace.getActiveFile();
            const lastFile = lastValidSelectionRef.current?.filePath;
            console.log("[useSelectedText] activeFile:", activeFile?.path, "lastFile:", lastFile);

            if (lastFile && activeFile && lastFile !== activeFile.path) {
                console.log("[useSelectedText] File changed, clearing selection");
                lastValidSelectionRef.current = null;
                setCurrentSelection(null);
                onSelectionChange?.(null);
            } else {
                console.log("[useSelectedText] File unchanged or no previous selection, keeping selection");
            }
        };

        const handleSelectionChangeDebounced = () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
                handleSelectionChange();
            }, 200);
        };

        app.workspace.on("editor-change", handleEditorChange);
        app.workspace.on("file-open", handleFileOpen);
        app.workspace.on("active-leaf-change", handleActiveLeafChange);
        document.addEventListener("selectionchange", handleSelectionChangeDebounced);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            app.workspace.off("editor-change", handleEditorChange);
            app.workspace.off("file-open", handleFileOpen);
            app.workspace.off("active-leaf-change", handleActiveLeafChange);
            document.removeEventListener("selectionchange", handleSelectionChangeDebounced);
        };
    }, [app, handleSelectionChange, onSelectionChange]);

    return { currentSelection, clearSelection };
};
