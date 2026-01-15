import { useCallback, useRef, useState } from "react";
import type { ChatMessage, ChatMessageRole } from "../types";
import { createMessageId } from "../utils";

export const useMessages = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const activeAssistantIdRef = useRef<string | null>(null);

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

    const clearMessages = useCallback(() => {
        setMessages([]);
        activeAssistantIdRef.current = null;
    }, []);

    return {
        messages,
        appendMessage,
        appendAssistantText,
        clearMessages
    };
};
