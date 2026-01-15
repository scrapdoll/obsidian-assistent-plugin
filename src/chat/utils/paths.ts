import type { App } from "obsidian";
import { FileSystemAdapter, normalizePath, TFile } from "obsidian";

export const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");

export const getVaultBasePath = (app: App): string | null => {
    const adapter = app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
        return normalizeSlashes(adapter.getBasePath());
    }

    return null;
};

export const toVaultRelativePath = (app: App, inputPath: string): string | null => {
    const normalized = normalizeSlashes(inputPath);
    const basePath = getVaultBasePath(app);

    if (basePath) {
        const trimmedBase = basePath.replace(/\/+$/, "");
        if (normalized === trimmedBase) {
            return "";
        }
        if (normalized.startsWith(`${trimmedBase}/`)) {
            return normalizePath(normalized.slice(trimmedBase.length + 1));
        }
    }

    if (!normalized.startsWith("/")) {
        return normalizePath(normalized.replace(/^\/+/, ""));
    }

    return null;
};

export const encodeVaultPath = (path: string) =>
    path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

export const toVaultUri = (path: string) => `vault:///${encodeVaultPath(path)}`;

export const resolveObsidianOpenUrl = (app: App, candidate: string): TFile | null => {
    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        return null;
    }

    if (url.protocol !== "obsidian:" || url.hostname !== "open") {
        return null;
    }

    const vaultName = url.searchParams.get("vault");
    if (vaultName && vaultName !== app.vault.getName()) {
        return null;
    }

    const fileParam = url.searchParams.get("file");
    if (!fileParam) {
        return null;
    }

    const decoded = decodeURIComponent(fileParam);
    const normalized = normalizePath(decoded);

    const exact = app.vault.getFileByPath(normalized);
    if (exact) {
        return exact;
    }

    const resolved = app.metadataCache.getFirstLinkpathDest(decoded, "");
    if (resolved) {
        return resolved;
    }

    if (!normalized.endsWith(".md")) {
        return app.vault.getFileByPath(`${normalized}.md`);
    }

    return null;
};
