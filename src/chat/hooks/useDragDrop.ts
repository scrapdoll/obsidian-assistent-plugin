import { useCallback, useState } from "react";
import type { DragEvent } from "react";

interface UseDragDropProps {
    onDropPaths: (paths: string[]) => void;
}

export const useDragDrop = ({ onDropPaths }: UseDragDropProps) => {
    const [isDragActive, setIsDragActive] = useState(false);

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

            void onDropPaths(paths);
        },
        [onDropPaths]
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

    return {
        isDragActive,
        handleDrop,
        handleDragOver,
        handleDragLeave,
        dragHandlers: {
            onDrop: handleDrop,
            onDragOver: handleDragOver,
            onDragLeave: handleDragLeave
        }
    };
};
