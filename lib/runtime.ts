import { Workspace } from "./workspace/store";
import { bootstrap } from "./workspace/bootstrap";
const globalState = globalThis as typeof globalThis & {
    wordfieldWorkspace?: { workspace: Workspace; ready: Promise<void> };
};
export async function getWorkspace() {
    if (!globalState.wordfieldWorkspace) {
        const workspace = new Workspace(process.cwd());
        globalState.wordfieldWorkspace = {
            workspace,
            ready: bootstrap(workspace, process.cwd()),
        };
    }
    await globalState.wordfieldWorkspace.ready;
    return globalState.wordfieldWorkspace.workspace;
}

import { HomeService } from "./home/service";
const services = globalThis as typeof globalThis & {
    wordfieldHome?: HomeService;
};
export async function getHome() {
    const workspace = await getWorkspace();
    return (services.wordfieldHome ??= new HomeService(workspace));
}
