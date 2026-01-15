import type { PermissionOption, RequestPermissionRequest } from "@agentclientprotocol/sdk";

export const formatPermissionTitle = (request: RequestPermissionRequest) => {
    const title = request.toolCall.title ?? `Tool ${request.toolCall.toolCallId}`;
    const kind = request.toolCall.kind ? request.toolCall.kind.replace(/_/g, " ") : "other";
    return `${title} - ${kind}`;
};

export const formatErrorDetails = (data: unknown) => {
    if (data == null) {
        return "";
    }

    if (typeof data === "string") {
        return ` (${data})`;
    }

    try {
        const text = JSON.stringify(data);
        if (text.length > 300) {
            return ` (${text.slice(0, 300)}...)`;
        }
        return ` (${text})`;
    } catch {
        return "";
    }
};

export const formatError = (error: unknown) => {
    if (error instanceof Error) {
        const maybeCode = (error as { code?: unknown }).code;
        const maybeData = (error as { data?: unknown }).data;
        const codeLabel =
            typeof maybeCode === "string" || typeof maybeCode === "number"
                ? ` [code ${maybeCode}]`
                : "";
        return `${error.message}${codeLabel}${formatErrorDetails(maybeData)}`;
    }

    if (error && typeof error === "object") {
        const maybeError = error as { message?: unknown; code?: unknown; data?: unknown };
        if (typeof maybeError.message === "string") {
            const codeLabel =
                typeof maybeError.code === "string" || typeof maybeError.code === "number"
                    ? ` [code ${maybeError.code}]`
                    : "";
            return `${maybeError.message}${codeLabel}${formatErrorDetails(maybeError.data)}`;
        }
    }

    return String(error);
};

export const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes)) {
        return "";
    }

    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }

    const decimals = value >= 10 || index === 0 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[index]}`;
};

export const formatPermissionInput = (input: unknown): string | null => {
    if (input == null) {
        return null;
    }

    if (typeof input === "string") {
        return input;
    }

    if (typeof input === "number" || typeof input === "boolean") {
        return String(input);
    }

    try {
        const text = JSON.stringify(input, null, 2);
        if (text.length > 1200) {
            return `${text.slice(0, 1200)}...`;
        }
        return text;
    } catch {
        return String(input);
    }
};

export const getPermissionOptionTone = (option: PermissionOption) => {
    if (option.kind === "allow_once" || option.kind === "allow_always") {
        return "allow";
    }

    if (option.kind === "reject_once" || option.kind === "reject_always") {
        return "reject";
    }

    return "neutral";
};
