import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trash2, ShieldCheck } from 'lucide-react';
import { useApp } from '../../app/DataContext.jsx';
import { Banner, Button, Card, ConfirmDialog, Field, PageHeader, Select } from '../../components/ui.jsx';
import ChatView from './ChatView.jsx';

export default function AssistantPage() {
  const { t, views, assistant, notify, settings } = useApp();
  const [sp, setSp] = useSearchParams();
  const [confirm, setConfirm] = useState(false);
  const [nonce, setNonce] = useState(0);
  const wanted = sp.get('c');
  // Explicit selection: with several comparisons nothing is chosen until the user picks one (a single comparison is used and announced by the answer).
  const current = views.find((v) => v.comparison.id === wanted) ?? (views.length === 1 ? views[0] : null);
  const id = current?.comparison.id ?? null;
  const aiOn = !!settings.assistantEndpoint;

  return (
    <div>
      <PageHeader
        title={t('as.title')}
        subtitle={t('as.subtitle')}
        actions={<Button variant="dangerGhost" icon={Trash2} onClick={() => setConfirm(true)}><span className="max-sm:hidden">{t('as.clear')}</span></Button>}
      />
      <div className="mx-auto max-w-3xl space-y-4">
        <Card className="p-4">
          {views.length > 0 ? (
            <Field label={t('as.compScope')}>
              <Select value={id ?? ''} onChange={(e) => setSp({ c: e.target.value })} aria-label={t('as.compScope')}>
                {!current && <option value="">{t('as.pickScope')}</option>}
                {views.map((v) => (
                  <option key={v.comparison.id} value={v.comparison.id}>{v.comparison.name}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-ink-soft">{t('as.noComparisons')}</p>
          )}
          {views.length > 1 && !current && <div data-scope-required className="mt-3"><Banner tone="warn" className="text-sm">{t('as.chooseScope', { n: views.length })}</Banner></div>}
        </Card>
        <Card className="p-4"><ChatView key={nonce} comparisonId={views.some((v) => v.comparison.id === wanted) ? wanted : null} hintId={id} /></Card>
        <Banner tone="info" className="text-xs">
          <span className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0" /><span>{t('as.privacy')}{aiOn ? ` ${t('as.privacy.ai')}` : ''}</span></span>
        </Banner>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t('as.clear')}
        text={t('as.clearConfirm')}
        confirmLabel={t('common.confirm')}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await assistant.clearHistory();
          setNonce((n) => n + 1);
          notify('ok', t('as.cleared'));
        }}
      />
    </div>
  );
}
