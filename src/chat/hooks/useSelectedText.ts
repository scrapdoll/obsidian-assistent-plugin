import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownView } from "obsidian";
import type { App, Editor } from "obsidian";
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

const extractSelection = (editor: Editor): string | null => {
    const selection = editor.getSelection();
    if (!selection) {
        return null;
    }
    const trimmed = selection.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const createSelectionAttachment = (
    app: App,
    editor: Editor,
    text: string
): SelectionAttachment | null => {
    if (text.length > MAX_SELECTION_SIZE) {
        return null;
    }

    const file = app.workspace.getActiveFile();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");

    return {
        id: createMessageId("selection"),
        kind: "selection",
        content: text,
        charCount: text.length,
        filePath: file?.path || "",
        lineStart: from.line,
        lineEnd: to.line,
    };
};

export const useSelectedText = ({
    app,
    onSelectionChange,
}: UseSelectedTextProps): UseSelectedTextReturn => {
    const [currentSelection, setCurrentSelection] = useState<SelectionAttachment | null>(null);
    const currentSelectionRef = useRef<SelectionAttachment | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        currentSelectionRef.current = currentSelection;
    }, [currentSelection]);

    const commitSelection = useCallback((next: SelectionAttachment | null) => {
        setCurrentSelection((prev) => {
            const isSame =
                prev &&
                next &&
                prev.content === next.content &&
                prev.filePath === next.filePath &&
                prev.lineStart === next.lineStart &&
                prev.lineEnd === next.lineEnd;

            if (isSame || (!prev && !next)) {
                return prev;
            }

            onSelectionChange?.(next);
            return next;
        });
    }, [onSelectionChange]);

    const updateSelection = useCallback(() => {
        const activeView = app.workspace.getActiveViewOfType(MarkdownView);
        const editor = activeView?.editor;
        const activeFile = app.workspace.getActiveFile();
        const previousSelection = currentSelectionRef.current;
        const isSameFile =
            !!previousSelection &&
            !!activeFile &&
            previousSelection.filePath === activeFile.path;

        if (!editor) {
            if (previousSelection && isSameFile) {
                return;
            }
            commitSelection(null);
            return;
        }

        const selectedText = extractSelection(editor);
        if (!selectedText) {
            const editorHasFocus = typeof editor.hasFocus === "function" ? editor.hasFocus() : false;
            if (!editorHasFocus && previousSelection && isSameFile) {
                return;
            }
            commitSelection(null);
            return;
        }

        const attachment = createSelectionAttachment(app, editor, selectedText);
        if (!attachment) {
            commitSelection(null);
            return;
        }

        commitSelection(attachment);
    }, [app, commitSelection]);

    const clearSelection = useCallback(() => {
        commitSelection(null);
    }, [commitSelection]);

    const scheduleUpdate = useCallback(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
            updateSelection();
        }, 200);
    }, [updateSelection]);

    useEffect(() => {
        const editorChangeRef = app.workspace.on("editor-change", scheduleUpdate);
        const fileOpenRef = app.workspace.on("file-open", scheduleUpdate);
        const activeLeafRef = app.workspace.on("active-leaf-change", scheduleUpdate);

        document.addEventListener("selectionchange", scheduleUpdate);
        scheduleUpdate();

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            app.workspace.offref(editorChangeRef);
            app.workspace.offref(fileOpenRef);
            app.workspace.offref(activeLeafRef);
            document.removeEventListener("selectionchange", scheduleUpdate);
        };
    }, [app, scheduleUpdate]);

    return { currentSelection, clearSelection };
};
