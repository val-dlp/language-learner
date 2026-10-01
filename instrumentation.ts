export async function register() {
    if (
        process.env.NEXT_RUNTIME === "nodejs" &&
        process.env.NEXT_PHASE !== "phase-production-build"
    ) {
        const { getRefill } = await import("./lib/runtime");
        // Resume only a durable completion event. Startup never invents a new lesson request.
        void getRefill()
            .then((worker) => worker.kick())
            .catch((error) =>
                console.error(
                    "Could not resume the saved lesson refill:",
                    error instanceof Error ? error.message : "unknown error",
                ),
            );
    }
}
