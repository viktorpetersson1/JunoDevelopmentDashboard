// T003 smoke surface — exercises tokens so we can eyeball the design system.
// Will be replaced by Surface 01 (Index dashboard, C1) in T046.
export default function HomePage() {
  return (
    <main className="mx-auto max-w-shell px-8 pb-16 pt-8">
      <header className="mb-8">
        <p className="text-eyebrow">P0 scaffold</p>
        <h1 className="text-display mt-2">Juno Atlas</h1>
        <p className="text-body mt-3 text-text-secondary">
          Tokens wired. Components ship in T004 onwards.
        </p>
      </header>

      {/* KPI smoke row — bg-surface-card, rounded-lg, shadow-sm */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="rounded-lg bg-surface-card p-5 shadow-sm">
          <p className="text-eyebrow">Peak equity</p>
          <p className="metric-value mt-2">$7.6M</p>
          <p className="text-xs-juno mt-2 text-text-tertiary">vs $6.0M LOC</p>
        </div>
        <div className="rounded-lg bg-surface-card p-5 shadow-sm">
          <p className="text-eyebrow">Projects active</p>
          <p className="metric-value mt-2">10</p>
          <p className="text-xs-juno mt-2 text-text-tertiary">across 2 markets</p>
        </div>
        <div className="rounded-lg bg-surface-card p-5 shadow-sm">
          <p className="text-eyebrow">Gross margin</p>
          <p className="metric-value mt-2">23.4%</p>
          <p className="text-xs-juno mt-2 text-text-tertiary">target 25%</p>
        </div>
      </section>

      {/* Accent CTA — used sparingly per DESIGN_BRIDGE.md §10 (≤5% of pixels) */}
      <div className="mt-8">
        <button className="rounded-md bg-accent-500 px-3.5 py-2 text-sm font-medium text-text-primary hover:bg-accent-600">
          New project
        </button>
      </div>
    </main>
  );
}
