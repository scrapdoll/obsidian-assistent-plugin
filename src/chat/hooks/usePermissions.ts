import { useCallback, useEffect, useRef, useState } from "react";
import type AcpClient from "acp/client";
import type {
    PermissionOption,
    RequestPermissionRequest,
    RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type { PermissionRequestState } from "../types";
import type { ChatMessageRole } from "../types";
import { createMessageId } from "../utils";

interface UsePermissionsProps {
    client: AcpClient;
    onMessage: (role: ChatMessageRole, content: string) => void;
}

export const usePermissions = ({ client, onMessage }: UsePermissionsProps) => {
    const [permissionQueue, setPermissionQueue] = useState<PermissionRequestState[]>([]);
    const permissionQueueRef = useRef<PermissionRequestState[]>([]);

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
            onMessage("system", `Permission selected: ${option.name}`);
        },
        [onMessage, resolvePermissionRequest]
    );

    const handlePermissionCancel = useCallback(() => {
        resolvePermissionRequest({ outcome: "cancelled" });
        onMessage("system", "Permission request cancelled.");
    }, [onMessage, resolvePermissionRequest]);

    const activePermission = permissionQueue[0] ?? null;
    const pendingPermissionCount = Math.max(permissionQueue.length - 1, 0);

    return {
        activePermission,
        pendingPermissionCount,
        handlePermissionSelect,
        handlePermissionCancel,
        permissionQueue,
        resolvePermissionRequest
    };
};
