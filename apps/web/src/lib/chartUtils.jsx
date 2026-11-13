export const short = (n) => (v) => (String(v).length > n ? `${String(v).slice(0, n - 1)}…` : v);

/** Legend drawn in HTML next to the chart: wraps freely, can never be clipped by the SVG viewport. */
export function LegendList({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 pb-4 text-xs text-ink-soft">
      {items.map((i) => (
        <li key={i.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

