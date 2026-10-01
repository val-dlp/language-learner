import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";

export class WorkspaceError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
    }
}
export function documentPath(value: string) {
    if (
        !value ||
        value.length > 500 ||
        value.startsWith("/") ||
        /[\\\x00-\x1f:]/.test(value) ||
        value
            .split("/")
            .some((p) => !p || p === "." || p === ".." || p.startsWith(".tmp-"))
    ) {
        throw new WorkspaceError(
            "Use a relative document path inside the workspace.",
        );
    }
    return value;
}
/** Application boundary, not an OS sandbox against a hostile process modifying directories concurrently. */
export class SafeFiles {
    private repository = "";
    root = "";
    constructor(private repositoryPath: string) {}
    async init() {
        this.repository = await realpath(this.repositoryPath);
        let current = this.repository;
        for (const name of [".local", "workspace"]) {
            current = path.join(current, name);
            try {
                await mkdir(current, { mode: 0o700 });
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST")
                    throw error;
            }
            const stat = await lstat(current);
            if (stat.isSymbolicLink() || !stat.isDirectory())
                throw new WorkspaceError(
                    "Workspace directories must not be symbolic links.",
                );
        }
        this.root = current;
        await this.checkRoot();
    }
    private async checkRoot() {
        for (const directory of [
            path.join(this.repository, ".local"),
            this.root,
        ]) {
            const stat = await lstat(directory);
            if (
                stat.isSymbolicLink() ||
                !stat.isDirectory() ||
                (await realpath(directory)) !== directory
            )
                throw new WorkspaceError("Workspace boundary changed.");
        }
    }
    async locate(relative: string, createParents = false) {
        documentPath(relative);
        await this.checkRoot();
        const parts = relative.split("/");
        let directory = this.root;
        for (const name of parts.slice(0, -1)) {
            directory = path.join(directory, name);
            if (createParents) {
                try {
                    await mkdir(directory, { mode: 0o700 });
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "EEXIST")
                        throw error;
                }
            }
            const stat = await lstat(directory);
            if (
                stat.isSymbolicLink() ||
                !stat.isDirectory() ||
                (await realpath(directory)) !== directory
            )
                throw new WorkspaceError(
                    "Symbolic links are not allowed in document paths.",
                );
        }
        const target = path.join(directory, parts.at(-1)!);
        try {
            const stat = await lstat(target);
            if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1)
                throw new WorkspaceError(
                    "Documents must be regular, unlinked files.",
                );
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        return target;
    }
    async read(relative: string): Promise<Buffer | null> {
        try {
            const target = await this.locate(relative);
            const file = await open(
                target,
                constants.O_RDONLY | constants.O_NOFOLLOW,
            );
            try {
                const stat = await file.stat();
                if (
                    !stat.isFile() ||
                    stat.nlink !== 1 ||
                    stat.size >
                        (relative === "_system/pending.json" ? 128 : 30) *
                            1024 *
                            1024
                )
                    throw new WorkspaceError("Invalid document file.");
                const data = await file.readFile();
                await this.locate(relative);
                return data;
            } finally {
                await file.close();
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw error;
        }
    }
    async write(relative: string, data: Buffer) {
        const target = await this.locate(relative, true);
        const temporary = path.join(
            path.dirname(target),
            `.tmp-${crypto.randomUUID()}`,
        );
        const file = await open(
            temporary,
            constants.O_WRONLY |
                constants.O_CREAT |
                constants.O_EXCL |
                constants.O_NOFOLLOW,
            0o600,
        );
        try {
            await file.writeFile(data);
            await file.sync();
        } finally {
            await file.close();
        }
        await this.locate(relative);
        await rename(temporary, target);
    }
    async remove(relative: string) {
        try {
            await unlink(await this.locate(relative));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    }
    async directory(relative: string) {
        await this.locate(`${documentPath(relative)}/placeholder`, true);
    }
}
