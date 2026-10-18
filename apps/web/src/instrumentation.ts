/**
 * Runs once when the Next.js server starts: keeps prices fresh in the background
 * (PRICE_CRON, default every 2 h) so the app does not depend on the "Cijene" button.
 * Disable with AUTO_REFRESH=0, e.g. when a separate cron/worker does the updates.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb, loadRootEnv } = await import("@inv/db");
  loadRootEnv();
  if (process.env.AUTO_REFRESH === "0") return;
  const { startAutoRefresh } = await import("@inv/core");
  await startAutoRefresh(getDb()).catch((e) => console.error("[prices] auto-refresh failed to start", e));
}
