export const isPromptParamError = (error: unknown) => {
    const asText = (value: unknown): string => {
        if (typeof value === "string") {
            return value;
        }

        if (!value || typeof value !== "object") {
            return "";
        }

        const seen = new WeakSet<object>();
        try {
            const stringifyReplacer = (_key: string, val: unknown): unknown => {
                if (val && typeof val === "object") {
                    const objectVal = val;
                    if (seen.has(objectVal)) {
                        return "[circular]";
                    }
                    seen.add(objectVal);
                }
                return val;
            };

            return JSON.stringify(value, stringifyReplacer);
        } catch {
            return "";
        }
    };

    const containsPromptParam = (value: unknown): boolean => {
        if (typeof value === "string") {
            return value.includes("prompt parameter");
        }

        if (!value || typeof value !== "object") {
            return false;
        }

        const message = (value as { message?: unknown }).message;
        if (typeof message === "string" && message.includes("prompt parameter")) {
            return true;
        }

        const details = (value as { details?: unknown }).details;
        if (typeof details === "string" && details.includes("prompt parameter")) {
            return true;
        }

        const blob = asText(value);
        if (blob && blob.includes("prompt parameter")) {
            return true;
        }

        return false;
    };

    if (containsPromptParam(error)) {
        return true;
    }

    let current: unknown = error;
    while (current && typeof current === "object") {
        const data = (current as { data?: unknown }).data;
        if (containsPromptParam(data)) {
            return true;
        }
        current = (data as { error?: unknown } | undefined)?.error;
    }

    return false;
};

export type ErrorWithMessage = { message: unknown; code?: unknown; data?: unknown };
export type ErrorWithData = { data?: unknown; error?: ErrorWithData };

export function isErrorWithMessage(value: unknown): value is ErrorWithMessage {
    return typeof value === "object" && value !== null && "message" in value;
}

export function isErrorWithData(value: unknown): value is ErrorWithData {
    return typeof value === "object" && value !== null && "data" in value;
}

export function hasCode(value: unknown): value is { code: string | number } {
    return typeof value === "object" && value !== null && "code" in value && (typeof (value as { code: unknown }).code === "string" || typeof (value as { code: unknown }).code === "number");
}

export function hasDetails(value: unknown): value is { details: unknown } {
    return typeof value === "object" && value !== null && "details" in value;
}

export function hasFileWithPath(value: unknown): value is { path: string } {
    return typeof value === "object" && value !== null && "path" in value && typeof (value as { path: unknown }).path === "string";
}
