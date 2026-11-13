import { componentDistribution } from '@cargoclear/core';
import { useApp } from '../app/DataContext.jsx';
import { Badge, cx } from './ui.jsx';
import { COMPONENT_COLORS } from '../lib/palette.js';

export function StatusBadge({ status }) {
  const { t } = useApp();
  const tone = { complete: 'ok', partial: 'warn', incomplete: 'bad' }[status] ?? 'neutral';
  return <Badge tone={tone}>{t(`status.${status}`)}</Badge>;
}

/** Per-offer comparability: comparable / partial / not_comparable (same wording as the overall status). */
export function ComparabilityBadge({ value }) {
  const { t } = useApp();
  const map = {
    comparable: ['ok', 'complete'],
    partial: ['warn', 'partial'],
    not_comparable: ['bad', 'incomplete'],
  };
  const [tone, key] = map[value] ?? map.partial;
  return <Badge tone={tone}>{t(`status.${key}`)}</Badge>;
}

export function DemoBadge() {
  const { t } = useApp();
  return <Badge tone="neutral" className="uppercase tracking-wide">{t('common.demo')}</Badge>;
}

export function EndpointBadge({ endpoint }) {
  const { t } = useApp();
  const tone = { warehouse: 'ok', hub: 'warn', terminal: 'warn' }[endpoint] ?? 'neutral';
  return <Badge tone={tone}>{t(`endpoint.${endpoint}`)}</Badge>;
}

export function CarrierName({ carrier, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      <span className="font-medium">{carrier?.name ?? '—'}</span>
      {carrier?.isDemo && <DemoBadge />}
    </span>
  );
}

export const route = (s) => `${s.origin} → ${s.destination}`;

/**
 * Horizontal bar of confirmed costs by component.
 * A hatched segment marks the part that is still unknown (its size is NOT a price estimate).
 */
export function CostBar({ entry }) {
  const { t } = useApp();
  const parts = componentDistribution(entry);
  const total = parts.reduce((s, p) => s + p.value, 0);
  const unknown = entry.analysis.missing.length > 0;
  const scale = unknown ? 0.82 : 1;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-canvas" aria-hidden>
      {total > 0 &&
        parts.map((p) => (
          <div
            key={p.key}
            title={t(`comp.${p.key}`)}
            style={{ width: `${(p.value / total) * 100 * scale}%`, background: COMPONENT_COLORS[p.key] }}
          />
        ))}
      {unknown && <div className="hatch flex-1" title={t('res.unknownPart')} />}
    </div>
  );
}
