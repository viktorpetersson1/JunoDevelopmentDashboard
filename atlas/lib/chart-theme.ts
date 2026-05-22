// Recharts theme — DESIGN_BRIDGE.md §6.
// Mandatory rules (also from design.md §5.6):
//   <CartesianGrid vertical={false} />  // horizontal only
//   tickLine={false} axisLine={false}    // on all axes
//   Area/line: type="monotone", strokeWidth={2}, gradient fill 0.15–0.18
//   Bar tops: radius={[6, 6, 0, 0]}
//   Series colours: --color-chart-1 .. --color-chart-6 only

export const chartTheme = {
  grid: {
    stroke: 'var(--color-border-subtle)',
    strokeDasharray: '0',
  },
  axis: {
    stroke: 'var(--color-border-default)',
    tick: { fill: 'var(--color-text-tertiary)', fontSize: 11 },
  },
  tooltip: {
    contentStyle: {
      background: 'var(--color-surface-card)',
      border: '1px solid var(--color-border-default)',
      borderRadius: 10,
      boxShadow: 'var(--shadow-md)',
      fontSize: 12,
    },
    cursor: { fill: 'var(--color-surface-sunken)', opacity: 0.5 },
  },
} as const;

/** Series colours — index 0–5 ↦ --color-chart-1 .. --color-chart-6. */
export const chartSeriesColors = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
] as const;

/** Standard area gradient definition — paste inside <defs> per series. */
export function areaGradient(id: string, color: string) {
  return {
    id,
    stops: [
      { offset: '0%', color, opacity: 0.18 },
      { offset: '100%', color, opacity: 0 },
    ],
  };
}
