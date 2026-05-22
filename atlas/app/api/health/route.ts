// Placeholder for T011. Returns 200 so Playwright webServer can detect the dev server.
// Final shape per API_CONTRACTS.md §1.1: { status: 'ok', commit, time }.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    status: 'ok',
    commit: process.env.RENDER_GIT_COMMIT ?? 'dev',
    time: new Date().toISOString(),
  });
}
