/**
 * Starts the Loura worker inside the server process, so assignments continue
 * while no browser is open. On first boot it also seeds the prototype fixtures.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.LOURA_SYSTEM_PASSWORD) {
    console.warn("[loura] LOURA_SYSTEM_PASSWORD is not set — the worker is disabled.");
    return;
  }
  const { startWorker } = await import("./server/worker");
  const { systemCtx } = await import("./server/context");
  const { isSeeded, seedFixtures } = await import("./server/seed");
  try {
    const sys = await systemCtx();
    if (!(await isSeeded(sys))) {
      console.log("[loura] seeding prototype fixtures");
      await seedFixtures(sys);
    }
  } catch (e) {
    console.error("[loura] fixture check failed:", e);
  }
  startWorker();
}
