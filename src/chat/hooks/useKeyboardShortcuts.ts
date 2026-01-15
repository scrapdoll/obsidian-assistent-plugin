import { useCallback } from "react";
import type { KeyboardEvent } from "react";

interface UseKeyboardShortcutsProps {
    onSend: () => void;
}

export const useKeyboardShortcuts = ({ onSend }: UseKeyboardShortcutsProps) => {
    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void onSend();
        }
    }, [onSend]);

    return {
        handleKeyDown
    };
};
