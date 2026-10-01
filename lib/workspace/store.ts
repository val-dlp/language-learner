import { createHash } from "node:crypto";
import { SafeFiles, WorkspaceError, documentPath } from "./files";

export type Scope = "app" | "home" | "reader" | "user";
export type Policy = "mutable" | "immutable";
export type DocMeta = {
    id: string;
    path: string;
    revision: number;
    hash: string;
    policy: Policy;
    actor: string;
    updatedAt: string;
    binary: boolean;
    educational: boolean;
};
export type Change = {
    sequence: number;
    path: string;
    id: string;
    oldRevision: number;
    revision: number;
    actor: string;
    at: string;
    operation: "created" | "updated" | "deleted";
};
type Manifest = {
    version: 1;
    sequence: number;
    documents: Record<string, DocMeta>;
    changes: Change[];
};
type Pending = {
    manifest: Manifest;
    files: { path: string; data: string | null }[];
};
export type Write = {
    path: string;
    content: string | Buffer;
    policy?: Policy;
    expectedRevision?: number;
    educational?: boolean;
};
export type Document = { meta: DocMeta; content: string };
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const empty = (): Manifest => ({
    version: 1,
    sequence: 0,
    documents: {},
    changes: [],
});
export function canRead(scope: Scope, path: string) {
    documentPath(path);
    return (
        scope === "app" ||
        path === "INDEX.md" ||
        path.startsWith("home/") ||
        (scope === "reader"
            ? path.startsWith("plugins/reading/")
            : path.startsWith("plugins/"))
    );
}
export function canWrite(scope: Scope, path: string) {
    documentPath(path);
    if (scope === "app") return true;
    if (scope === "reader") return false;
    if (path === "home/profile.md" || path === "home/curriculum.md")
        return true;
    return (
        scope === "home" &&
        ((path.startsWith("home/observations/") && path.endsWith(".md")) ||
            /^plugins\/[^/]+\/drafts\/[^/]+\.json$/.test(path))
    );
}
export class Workspace {
    readonly files: SafeFiles;
    private manifest = empty();
    private ready: Promise<void>;
    private queue: Promise<unknown> = Promise.resolve();
    constructor(repository: string) {
        this.files = new SafeFiles(repository);
        this.ready = this.initialize();
    }
    private async initialize() {
        await this.files.init();
        const pending = await this.files.read("_system/pending.json");
        if (pending) await this.apply(JSON.parse(pending.toString()));
        const saved = await this.files.read("_system/manifest.json");
        if (saved) this.manifest = JSON.parse(saved.toString());
        if (
            this.manifest.version !== 1 ||
            !this.manifest.documents ||
            !Array.isArray(this.manifest.changes)
        )
            throw new WorkspaceError(
                "The workspace manifest is invalid; files were preserved.",
                500,
            );
    }
    private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
        await this.ready;
        const result = this.queue.then(fn);
        this.queue = result.catch(() => {});
        return result;
    }
    private async apply(pending: Pending) {
        for (const file of pending.files) {
            if (file.data === null) await this.files.remove(file.path);
            else
                await this.files.write(
                    file.path,
                    Buffer.from(file.data, "base64"),
                );
        }
        await this.files.write(
            "_system/manifest.json",
            Buffer.from(JSON.stringify(pending.manifest)),
        );
        this.manifest = pending.manifest;
        await this.files.remove("_system/pending.json");
    }
    private async recover() {
        const pending = await this.files.read("_system/pending.json");
        if (pending) await this.apply(JSON.parse(pending.toString()));
    }
    private async reconcile() {
        await this.recover();
        const changes: Write[] = [];
        for (const meta of Object.values(this.manifest.documents)) {
            if (!meta.educational) continue;
            const content = await this.files.read(meta.path);
            if (!content)
                throw new WorkspaceError(
                    `A tracked document is missing: ${meta.path}. Restore it before continuing.`,
                    409,
                );
            if (hash(content) !== meta.hash) {
                if (meta.policy === "immutable")
                    throw new WorkspaceError(
                        `Immutable evidence was modified externally: ${meta.path}. Restore its saved revision.`,
                        409,
                    );
                changes.push({
                    path: meta.path,
                    content,
                    policy: meta.policy,
                    expectedRevision: meta.revision,
                    educational: true,
                });
            }
        }
        if (changes.length) await this.commit(changes, "app", "external");
    }
    private async commit(
        writes: Write[],
        scope: Scope,
        actor: string,
        deletes: string[] = [],
    ) {
        const next = structuredClone(this.manifest);
        const files: Pending["files"] = [];
        const seen = new Set<string>();
        for (const write of writes) {
            const name = documentPath(write.path);
            if (seen.has(name))
                throw new WorkspaceError("Duplicate document in transaction.");
            seen.add(name);
            if (!canWrite(scope, name))
                throw new WorkspaceError(
                    "This document is read-only for this agent.",
                    403,
                );
            const prior = next.documents[name];
            if (prior?.policy === "immutable")
                throw new WorkspaceError(
                    "This document is immutable. Create a correction instead.",
                    403,
                );
            if (
                write.expectedRevision !== undefined &&
                write.expectedRevision !== (prior?.revision ?? 0)
            )
                throw new WorkspaceError(
                    `Document changed: ${name}. Read its latest version first.`,
                    409,
                );
            const content = Buffer.isBuffer(write.content)
                ? write.content
                : Buffer.from(write.content);
            if (content.byteLength > 26 * 1024 * 1024)
                throw new WorkspaceError("Document is too large.");
            const meta: DocMeta = {
                id: prior?.id ?? crypto.randomUUID(),
                path: name,
                revision: (prior?.revision ?? 0) + 1,
                hash: hash(content),
                policy: prior?.policy ?? write.policy ?? "mutable",
                actor,
                updatedAt: new Date().toISOString(),
                binary: name.endsWith(".pdf"),
                educational:
                    !name.startsWith("_system/") &&
                    (write.educational ?? prior?.educational ?? true),
            };
            next.documents[name] = meta;
            if (meta.educational) {
                next.changes.push({
                    sequence: ++next.sequence,
                    path: name,
                    id: meta.id,
                    oldRevision: prior?.revision ?? 0,
                    revision: meta.revision,
                    actor,
                    at: meta.updatedAt,
                    operation: prior ? "updated" : "created",
                });
                files.push({
                    path: `_system/revisions/${meta.id}/${meta.revision}.json`,
                    data: Buffer.from(
                        JSON.stringify({
                            meta,
                            content: content.toString("base64"),
                        }),
                    ).toString("base64"),
                });
            }
            files.push({ path: name, data: content.toString("base64") });
        }
        for (const name of deletes) {
            documentPath(name);
            if (scope !== "app" || !name.startsWith("_system/"))
                throw new WorkspaceError(
                    "Only temporary operational files can be discarded.",
                    403,
                );
            delete next.documents[name];
            files.push({ path: name, data: null });
        }
        const pending = { manifest: next, files };
        await this.files.write(
            "_system/pending.json",
            Buffer.from(JSON.stringify(pending)),
        );
        await this.apply(pending);
    }
    async read(
        path: string,
        scope: Scope = "app",
        revision?: number,
    ): Promise<Document> {
        return this.exclusive(async () => {
            if (!canRead(scope, path))
                throw new WorkspaceError(
                    "Document is outside this agent's scope.",
                    403,
                );
            await this.reconcile();
            const meta = this.manifest.documents[path];
            if (!meta) throw new WorkspaceError("Document not found.", 404);
            if (revision !== undefined) {
                if (!Number.isSafeInteger(revision) || revision < 1)
                    throw new WorkspaceError("Invalid revision.");
                const saved = await this.files.read(
                    `_system/revisions/${meta.id}/${revision}.json`,
                );
                if (!saved)
                    throw new WorkspaceError("Revision not found.", 404);
                const previous = JSON.parse(saved.toString());
                return {
                    meta: previous.meta,
                    content: Buffer.from(previous.content, "base64").toString(),
                };
            }
            if (meta.binary)
                throw new WorkspaceError(
                    "Use the document's extracted pages to read its text.",
                );
            return {
                meta: structuredClone(meta),
                content: (await this.files.read(path))!.toString(),
            };
        });
    }
    async list(scope: Scope = "app", prefix = "") {
        if (prefix) documentPath(prefix.replace(/\/$/, ""));
        return this.exclusive(async () => {
            await this.reconcile();
            return Object.values(this.manifest.documents)
                .filter(
                    (meta) =>
                        canRead(scope, meta.path) &&
                        meta.path.startsWith(prefix),
                )
                .map((meta) => structuredClone(meta))
                .sort((a, b) => a.path.localeCompare(b.path));
        });
    }
    async write(write: Write, scope: Scope = "app", actor = scope) {
        return this.exclusive(async () => {
            await this.reconcile();
            await this.commit([write], scope, actor);
            return structuredClone(this.manifest.documents[write.path]);
        });
    }
    /** Serialize changes to operational state and evidence in the same recoverable commit. */
    async mutate<T>(
        fn: (tx: {
            get: <V>(path: string, fallback: V) => Promise<V>;
            put: (write: Write) => void;
            discard: (path: string) => void;
        }) => Promise<T>,
        actor = "app",
    ) {
        return this.exclusive(async () => {
            await this.reconcile();
            const writes: Write[] = [];
            const deletes: string[] = [];
            const result = await fn({
                get: async <V>(name: string, fallback: V) => {
                    const data = await this.files.read(documentPath(name));
                    return data
                        ? (JSON.parse(data.toString()) as V)
                        : structuredClone(fallback);
                },
                put: (write) => writes.push(write),
                discard: (name) => deletes.push(name),
            });
            if (writes.length || deletes.length)
                await this.commit(writes, "app", actor, deletes);
            return structuredClone(result);
        });
    }
    async diff(scope: Scope, after: number, limit = 30, upper?: number) {
        return this.exclusive(async () => {
            await this.reconcile();
            if (!Number.isSafeInteger(after) || after < 0)
                throw new WorkspaceError("Invalid diff cursor.");
            const through = Math.min(
                upper ?? this.manifest.sequence,
                this.manifest.sequence,
            );
            const candidates = this.manifest.changes.filter(
                (c) =>
                    c.sequence > after &&
                    c.sequence <= through &&
                    canRead(scope, c.path),
            );
            const changes = candidates.slice(
                0,
                Math.min(50, Math.max(1, limit)),
            );
            const more = candidates.length > changes.length;
            return {
                changes: structuredClone(changes),
                nextCursor: more ? changes.at(-1)!.sequence : through,
                through,
                more,
            };
        });
    }
    async mkdir(path: string, scope: Scope) {
        documentPath(path);
        if (
            scope !== "app" &&
            !(scope === "home" && path.startsWith("home/observations/"))
        )
            throw new WorkspaceError(
                "Directories may be created under Home observations.",
                403,
            );
        return this.exclusive(async () => {
            await this.files.directory(path);
            return { path };
        });
    }
}
