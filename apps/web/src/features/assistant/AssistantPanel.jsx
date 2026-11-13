import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, ChevronDown, ExternalLink } from 'lucide-react';
import { useApp } from '../../app/DataContext.jsx';
import { Card, cx } from '../../components/ui.jsx';
import ChatView from './ChatView.jsx';

/** Contextual assistant inside the comparison results page: always scoped to THIS comparison. */
export default function AssistantPanel({ comparisonId }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <Card className="mt-5" data-assistant-panel>
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-4 text-left"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-white"><Bot size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t('as.panel.title')}</span>
            <span className="block truncate text-xs text-ink-soft">{t('as.panel.desc')}</span>
          </span>
          <ChevronDown size={18} className={cx('shrink-0 text-ink-soft transition-transform', open && 'rotate-180')} />
        </button>
        <Link to={`/assistant?c=${comparisonId}`} aria-label={t('as.openFull')} title={t('as.openFull')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-canvas hover:text-brand md:h-9 md:w-9">
          <ExternalLink size={16} />
        </Link>
      </div>
      {open && (
        <div className="border-t border-line p-4">
          <ChatView comparisonId={comparisonId} onlyScope compact />
        </div>
      )}
    </Card>
  );
}
