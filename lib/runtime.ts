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

import { QuizService } from "./plugins/vocabulary/service";
import { RefillWorker } from "./home/refill";
const practice = globalThis as typeof globalThis & {
    wordfieldQuiz?: QuizService;
    wordfieldRefill?: RefillWorker;
};
export async function getQuiz() {
    const workspace = await getWorkspace();
    return (practice.wordfieldQuiz ??= new QuizService(workspace));
}
export async function getRefill() {
    const home = await getHome();
    return (practice.wordfieldRefill ??= new RefillWorker(
        home.workspace,
        home,
    ));
}
