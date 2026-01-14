import * as acp from "@agentclientprotocol/sdk";
import { ChildProcess, spawn } from "child_process";
import { App, FileSystemAdapter, Platform, TFile, TFolder, normalizePath } from "obsidian";

export type AcpClientOptions = {
    app: App;
    onRequestPermission?: (
        params: acp.RequestPermissionRequest
    ) => Promise<acp.RequestPermissionResponse>;
    onSessionUpdate?: (params: acp.SessionNotification) => Promise<void> | void;
    onExtMethod?: (
        method: string,
        params: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;
    onExtNotification?: (
        method: string,
        params: Record<string, unknown>
    ) => Promise<void> | void;
};

type PermissionRequestHandler = (
    params: acp.RequestPermissionRequest
) => Promise<acp.RequestPermissionResponse>;

export default class AcpClient implements acp.Client {
    private app: App;
    private onRequestPermission?: AcpClientOptions["onRequestPermission"];
    private onSessionUpdate?: AcpClientOptions["onSessionUpdate"];
    private onExtMethod?: AcpClientOptions["onExtMethod"];
    private onExtNotification?: AcpClientOptions["onExtNotification"];
    private connection: acp.ClientSideConnection | null = null;
    private agentProcess: ChildProcess | null = null;
    private initializationPromise: Promise<acp.InitializeResponse> | null = null;
    private sessionPromise: Promise<acp.NewSessionResponse> | null = null;
    private sessionId: acp.SessionId | null = null;
    private sessionUpdateHandlers = new Set<
        (params: acp.SessionNotification) => Promise<void> | void
    >();
    private permissionRequestHandlers = new Set<PermissionRequestHandler>();

    constructor(options: AcpClientOptions) {
        this.app = options.app;
        this.onRequestPermission = options.onRequestPermission;
        this.onSessionUpdate = options.onSessionUpdate;
        this.onExtMethod = options.onExtMethod;
        this.onExtNotification = options.onExtNotification;
    }

    private resetConnectionState(agentProcess?: ChildProcess) {
        if (agentProcess && this.agentProcess && agentProcess !== this.agentProcess) {
            return;
        }

        this.agentProcess = null;
        this.connection = null;
        this.initializationPromise = null;
        this.sessionPromise = null;
        this.sessionId = null;
    }

    async initialize(): Promise<acp.InitializeResponse> {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        if (!this.connection) {
            let shell = "";

            if (Platform.isLinux || Platform.isMacOS) {
                shell = Platform.isMacOS ? "/bin/zsh" : "/bin/bash";
            }

            const spawnCommand = shell || "claude-code-acp";
            const spawnArgs = shell ? ["-lc", "claude-code-acp"] : [];
            const agentProcess = spawn(spawnCommand, spawnArgs, {
                stdio: ["pipe", "pipe", "pipe"]
            });

            this.agentProcess = agentProcess;

            agentProcess.on("spawn", () => {
                console.log(`process spawned successfully, PDI: ${agentProcess.pid}`);
            });

            agentProcess.on("error", (error) => {
                console.log(`process error: ${error}`);
                this.resetConnectionState(agentProcess);
            });

            agentProcess.on("exit", (code, signal) => {
                console.log(`process exit with code: ${code} signal: ${signal}`);
                this.resetConnectionState(agentProcess);
            });

            const stdin = agentProcess.stdin;
            const stdout = agentProcess.stdout;

            if (!stdin || !stdout) {
                throw new Error("ACP process missing stdio streams.");
            }

            const input = new WritableStream<Uint8Array>({
                write(chunk) {
                    stdin.write(chunk);
                },
                close() {
                    stdin.end();
                }
            });

            const output = new ReadableStream<Uint8Array>({
                start(controller) {
                    stdout.on("data", (chunk: Uint8Array) => {
                        controller.enqueue(chunk);
                    });
                    stdout.on("end", () => {
                        controller.close();
                    });
                }
            });

            const stream = acp.ndJsonStream(input, output);

            this.connection = new acp.ClientSideConnection(() => this, stream);
        }

        const connection = this.connection;
        if (!connection) {
            throw new Error("ACP connection unavailable.");
        }

        this.initializationPromise = connection.initialize({
            protocolVersion: acp.PROTOCOL_VERSION,
            clientCapabilities: {
                fs: {
                    readTextFile: true,
                    writeTextFile: true
                }
            }
        });
        this.initializationPromise.catch(() => {
            this.initializationPromise = null;
        });

        return this.initializationPromise;
    }

    disconnect(): Promise<void> {
        if (this.agentProcess) {
            if (this.agentProcess.stdin) {
                this.agentProcess.stdin.end();
            }

            this.agentProcess.kill("SIGTERM");

            const timeout = setTimeout(() => {
                if (this.agentProcess) {
                    this.agentProcess.kill("SIGKILL");
                }
            }, 5000);

            this.agentProcess.once("close", () => {
                clearTimeout(timeout);
            });

            this.agentProcess = null;
        }

        this.resetConnectionState();

        return Promise.resolve();
    }

    async requestPermission(
        params: acp.RequestPermissionRequest
    ): Promise<acp.RequestPermissionResponse> {
        if (this.onRequestPermission) {
            return this.onRequestPermission(params);
        }

        for (const handler of this.permissionRequestHandlers) {
            try {
                return await handler(params);
            } catch (error) {
                console.warn(`Permission request handler error: ${error}`);
            }
        }

        return { outcome: { outcome: "cancelled" } };
    }

    async sessionUpdate(params: acp.SessionNotification): Promise<void> {
        for (const handler of this.sessionUpdateHandlers) {
            try {
                await handler(params);
            } catch (error) {
                console.warn(`Session update handler error: ${error}`);
            }
        }

        if (this.onSessionUpdate) {
            await this.onSessionUpdate(params);
        }
    }

    subscribeSessionUpdates(
        handler: (params: acp.SessionNotification) => Promise<void> | void
    ): () => void {
        this.sessionUpdateHandlers.add(handler);
        return () => {
            this.sessionUpdateHandlers.delete(handler);
        };
    }

    subscribePermissionRequests(handler: PermissionRequestHandler): () => void {
        this.permissionRequestHandlers.add(handler);
        return () => {
            this.permissionRequestHandlers.delete(handler);
        };
    }

    async ensureSession(): Promise<acp.SessionId> {
        await this.initialize();

        if (this.sessionId) {
            return this.sessionId;
        }

        const connection = this.connection;
        if (!connection) {
            throw new Error("ACP connection unavailable.");
        }

        if (!this.sessionPromise) {
            const cwd = this.getVaultBasePath();
            if (!cwd) {
                throw new Error("Vault path is unavailable.");
            }

            this.sessionPromise = connection.newSession({
                cwd,
                mcpServers: []
            });
        }

        try {
            const response = await this.sessionPromise;
            this.sessionId = response.sessionId;
            return response.sessionId;
        } catch (error) {
            this.sessionPromise = null;
            throw error;
        }
    }

    async sendPrompt(
        prompt: string | acp.ContentBlock[]
    ): Promise<acp.PromptResponse> {
        const sessionId = await this.ensureSession();
        const blocks: acp.ContentBlock[] =
            typeof prompt === "string" ? [{ type: "text" as const, text: prompt }] : prompt;
        return this.connection!.prompt({
            sessionId,
            prompt: blocks
        });
    }

    async cancelPrompt(): Promise<void> {
        const sessionId = await this.ensureSession();
        await this.connection!.cancel({ sessionId });
    }

    async writeTextFile(
        params: acp.WriteTextFileRequest
    ): Promise<acp.WriteTextFileResponse> {
        const vaultPath = this.resolveVaultPath(params.path);
        if (!vaultPath) {
            throw acp.RequestError.invalidParams({ path: params.path }, "Path points to vault root");
        }

        await this.ensureParentFolder(vaultPath);
        const existing = this.app.vault.getAbstractFileByPath(vaultPath);

        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, params.content);
            return {};
        }

        if (existing) {
            throw acp.RequestError.invalidParams(
                { path: params.path },
                "Path points to a non-file entry"
            );
        }

        await this.app.vault.create(vaultPath, params.content);
        return {};
    }

    async readTextFile(
        params: acp.ReadTextFileRequest
    ): Promise<acp.ReadTextFileResponse> {
        const vaultPath = this.resolveVaultPath(params.path);
        if (!vaultPath) {
            throw acp.RequestError.invalidParams({ path: params.path }, "Path points to vault root");
        }

        const file = this.app.vault.getAbstractFileByPath(vaultPath);
        if (!(file instanceof TFile)) {
            throw acp.RequestError.resourceNotFound(params.path);
        }

        const content = await this.app.vault.read(file);
        return {
            content: this.sliceTextByLine(content, params.line, params.limit),
        };
    }

    async createTerminal(
        _params: acp.CreateTerminalRequest
    ): Promise<acp.CreateTerminalResponse> {
        return this.unsupportedTerminal("terminal/create");
    }

    async terminalOutput(
        _params: acp.TerminalOutputRequest
    ): Promise<acp.TerminalOutputResponse> {
        return this.unsupportedTerminal("terminal/output");
    }

    async releaseTerminal(
        _params: acp.ReleaseTerminalRequest
    ): Promise<acp.ReleaseTerminalResponse | void> {
        return this.unsupportedTerminal("terminal/release");
    }

    async waitForTerminalExit(
        _params: acp.WaitForTerminalExitRequest
    ): Promise<acp.WaitForTerminalExitResponse> {
        return this.unsupportedTerminal("terminal/wait_for_exit");
    }

    async killTerminal(
        _params: acp.KillTerminalCommandRequest
    ): Promise<acp.KillTerminalCommandResponse | void> {
        return this.unsupportedTerminal("terminal/kill");
    }

    async extMethod(
        method: string,
        params: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        if (!this.onExtMethod) {
            throw acp.RequestError.methodNotFound(method);
        }

        return this.onExtMethod(method, params);
    }

    async extNotification(
        method: string,
        params: Record<string, unknown>
    ): Promise<void> {
        if (this.onExtNotification) {
            await this.onExtNotification(method, params);
        }
    }

    private unsupportedTerminal(method: string): never {
        throw acp.RequestError.methodNotFound(method);
    }

    private normalizeSlashes(value: string): string {
        return value.replace(/\\/g, "/");
    }

    private isAbsolutePath(value: string): boolean {
        return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
    }

    private getVaultBasePath(): string | null {
        const adapter = this.app.vault.adapter;
        if (adapter instanceof FileSystemAdapter) {
            return adapter.getBasePath();
        }

        return null;
    }

    private resolveVaultPath(path: string): string {
        const normalizedPath = this.normalizeSlashes(path);
        const basePath = this.getVaultBasePath();

        if (basePath) {
            const normalizedBase = this.normalizeSlashes(basePath).replace(/\/+$/, "");

            if (normalizedPath === normalizedBase) {
                return "";
            }

            if (normalizedPath.startsWith(`${normalizedBase}/`)) {
                return this.ensureSafeRelative(
                    normalizePath(normalizedPath.slice(normalizedBase.length + 1))
                );
            }

            if (!this.isAbsolutePath(normalizedPath)) {
                return this.ensureSafeRelative(normalizePath(normalizedPath));
            }

            throw acp.RequestError.invalidParams(
                { path },
                "Path is outside the vault"
            );
        }

        const relativeFallback = normalizedPath.replace(/^\/+/, "");
        return this.ensureSafeRelative(normalizePath(relativeFallback));
    }

    private ensureSafeRelative(path: string): string {
        const segments = path.split("/");
        if (segments.includes("..")) {
            throw acp.RequestError.invalidParams({ path }, "Path traversal is not allowed");
        }
        return path;
    }

    private async ensureParentFolder(path: string): Promise<void> {
        const parts = path.split("/");
        if (parts.length <= 1) {
            return;
        }

        const folderPath = parts.slice(0, -1).join("/");
        const existing = this.app.vault.getAbstractFileByPath(folderPath);

        if (!existing) {
            await this.app.vault.createFolder(folderPath);
            return;
        }

        if (!(existing instanceof TFolder)) {
            throw acp.RequestError.invalidParams(
                { path },
                "Parent path is not a folder"
            );
        }
    }

    private sliceTextByLine(
        content: string,
        line?: number | null,
        limit?: number | null
    ): string {
        if (line != null && (!Number.isInteger(line) || line < 1)) {
            throw acp.RequestError.invalidParams({ line }, "Line must be a positive integer");
        }

        if (limit != null && (!Number.isInteger(limit) || limit < 1)) {
            throw acp.RequestError.invalidParams({ limit }, "Limit must be a positive integer");
        }

        if (line == null && limit == null) {
            return content;
        }

        const lines = content.split(/\r?\n/);
        const start = (line ?? 1) - 1;
        const end = limit == null ? lines.length : start + limit;

        if (start >= lines.length) {
            return "";
        }

        return lines.slice(start, end).join("\n");
    }
}
