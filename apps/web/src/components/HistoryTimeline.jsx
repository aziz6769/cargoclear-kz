import { Clock, FilePlus2, GitCompare, MessageSquare, Pencil, Plus, Repeat } from 'lucide-react';
import { useApp } from '../app/DataContext.jsx';
import { EmptyState } from './ui.jsx';

const ICON = { created: Plus, updated: Pencil, status: Repeat, comparison: GitCompare, document: FilePlus2, interaction: MessageSquare };

/** Renders stored events (append-only log). Text is built from event data + i18n, so it follows the UI language. */
export default function HistoryTimeline({ events, entity = 'shipment', onRemove }) {
  const { t, fmt } = useApp();
  if (!events.length) return <EmptyState icon={Clock} title={t('hx.empty')} />;
  const text = (e) => {
    switch (e.kind) {
      case 'created': return t(`hx.${entity}.created`);
      case 'updated': return t('hx.updated', { fields: e.fields.map((f) => t(`hx.field.${f}`)).join(', ') });
      case 'status': return t('hx.status', { from: t(`shipStatus.${e.from}`), to: t(`shipStatus.${e.to}`) });
      case 'comparison': return t('hx.comparison', { name: e.name });
      case 'document': return t('hx.document', { name: e.title });
      case 'interaction': return `${t(`hx.channel.${e.channel}`)}: ${e.note}`;
      default: return e.kind;
    }
  };
  return (
    <ol className="divide-y divide-line" data-timeline>
      {events.map((e) => {
        const Icon = ICON[e.kind] ?? Clock;
        return (
          <li key={e.id} className="flex items-start gap-3 px-4 py-3 sm:px-5" data-event={e.kind}>
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-soft"><Icon size={14} /></span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm">{text(e)}</p>
              <p className="tabular mt-0.5 text-xs text-ink-soft">{fmt.date(e.ts)}</p>
            </div>
            {onRemove && e.kind === 'interaction' && (
              <button type="button" onClick={() => onRemove(e)} aria-label={t('common.delete')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-canvas hover:text-bad">×</button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
