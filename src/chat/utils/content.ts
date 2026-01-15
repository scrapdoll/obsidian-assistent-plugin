import type { ContentBlock, ToolCall, ToolCallUpdate } from "@agentclientprotocol/sdk";

export const contentToText = (content: ContentBlock): string => {
    if (content.type === "text") {
        return content.text;
    }

    if (content.type === "resource_link") {
        return `Resource: ${content.title ?? content.name ?? content.uri}`;
    }

    if (content.type === "resource") {
        if ("text" in content.resource) {
            return content.resource.text;
        }

        return `Resource: ${content.resource.uri}`;
    }

    return `[${content.type} content]`;
};

export const describeToolCall = (prefix: string, toolCall: ToolCall | ToolCallUpdate) => {
    const title = toolCall.title ?? `Tool ${toolCall.toolCallId}`;
    const status = toolCall.status ? ` (${toolCall.status})` : "";
    return `${prefix}: ${title}${status}`;
};
