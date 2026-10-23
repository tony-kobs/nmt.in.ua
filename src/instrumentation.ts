export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { startMarathonScheduler } = await import("./modules/marathons/daily/scheduler");
    startMarathonScheduler();
  } catch (error) {
    console.error("marathon scheduler start", error);
  }
}
