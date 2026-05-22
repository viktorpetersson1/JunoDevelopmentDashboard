// T003 smoke surface — exercises canonical tokens (design-system source).
// Will be replaced by Surface 01 (Index dashboard, C1) in T046.
// Uses raw token-mapped Tailwind classes until primitives ship in T004.
export default function HomePage() {
  return (
    <main className="mx-auto max-w-shell px-12 pb-16 pt-8">
      <header className="mb-8">
        <p className="text-micro font-medium uppercase tracking-wide text-text-tertiary">
          P0 scaffold
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-text-primary">Juno Atlas</h1>
        <p className="mt-3 text-base text-text-secondary">
          Tokens wired. Components ship in T004 onwards.
        </p>
      </header>

      {/* KPI smoke row — bg-surface-muted, rounded-xl */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl bg-surface-muted p-5">
          <p className="text-micro font-medium uppercase tracking-wide text-text-tertiary">
            Peak equity
          </p>
          <p className="mt-2 text-kpi font-semibold tabular-nums text-text-primary">$7.6M</p>
          <p className="mt-2 text-xs text-text-tertiary">vs $6.0M LOC</p>
        </div>
        <div className="rounded-xl bg-surface-muted p-5">
          <p className="text-micro font-medium uppercase tracking-wide text-text-tertiary">
            Projects active
          </p>
          <p className="mt-2 text-kpi font-semibold tabular-nums text-text-primary">10</p>
          <p className="mt-2 text-xs text-text-tertiary">across 2 markets</p>
        </div>
        <div className="rounded-xl bg-surface-muted p-5">
          <p className="text-micro font-medium uppercase tracking-wide text-text-tertiary">
            Gross margin
          </p>
          <p className="mt-2 text-kpi font-semibold tabular-nums text-text-primary">23.4%</p>
          <p className="mt-2 text-xs text-text-tertiary">target 25%</p>
        </div>
      </section>

      {/* Lime CTA — used sparingly (≤5% of pixels) */}
      <div className="mt-8">
        <button className="h-8 rounded-md bg-accent-lime px-3 text-sm font-medium text-text-on-lime transition-colors duration-fast ease-standard hover:bg-accent-lime-hover">
          New project
        </button>
      </div>
    </main>
  );
}
