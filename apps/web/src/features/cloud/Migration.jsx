import { useEffect, useMemo, useState } from 'react';
import { buildMigrationPlan, countRealRecords, readLocalData, runMigration } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { useAuth } from '../../app/AuthContext.jsx';
import { Banner, Button, Card, CardHeader, Checkbox, ConfirmDialog, PageHeader, Spinner } from '../../components/ui.jsx';
import { createDexieAdapter } from '../../storage/dexieAdapter.js';

export const LEGACY_DB = 'cargoclear-kz';
const COLLS = ['shipments', 'carriers', 'comparisons', 'offers', 'documents', 'events'];

/**
 * IndexedDB -> cloud migration. Explicit, resumable, verified. The local copy is never touched by the upload;
 * deleting it is a separate action that only becomes available after a fully verified report.
 */
export default function Migration({ localAdapter }) {
  const { t, notify, syncNow } = useApp();
  const { client, user } = useAuth();
  const local = useMemo(() => localAdapter ?? createDexieAdapter(LEGACY_DB), [localAdapter]);
  const [load, setLoad] = useState({ status: 'loading', data: null });
  const [agree, setAgree] = useState(false);
  const [run, setRun] = useState({ busy: false, progress: null, report: null });
  const [wipe, setWipe] = useState(false);

  useEffect(() => {
    let alive = true;
    readLocalData(local)
      .then((data) => alive && setLoad({ status: 'ready', data }))
      .catch((error) => alive && setLoad({ status: 'error', error }));
    return () => { alive = false; };
  }, [local]);

  const plan = useMemo(() => (load.data ? buildMigrationPlan(load.data, user.id) : null), [load.data, user.id]);
  const real = load.data ? countRealRecords(load.data) : 0;

  const start = async () => {
    if (run.busy) return; // duplicate-submission guard
    setRun({ busy: true, progress: null, report: null });
    let report;
    try {
      report = await runMigration({ plan, client, userId: user.id, onProgress: (progress) => setRun((r) => ({ ...r, progress })) });
    } catch (e) {
      report = { ok: false, failed: [{ coll: '—', ids: [], error: String(e?.message ?? e) }], missing: [], files: {} };
    }
    setRun({ busy: false, progress: null, report });
    if (report.ok) {
      notify('ok', t('mig.done'));
      syncNow();
    }
  };

  const deleteLocal = async () => {
    setWipe(false);
    await local.clearAll();
    setLoad({ status: 'ready', data: await readLocalData(local) });
    setRun({ busy: false, progress: null, report: null });
    notify('ok', t('mig.localDeleted'));
  };

  if (load.status === 'loading') return <Spinner label={t('common.loading')} />;
  if (load.status === 'error') return <Banner tone="bad" title={t('err.storage')}>{String(load.error?.message ?? load.error)}</Banner>;
  const rep = run.report;
  const p = run.progress;

  return (
    <div className="space-y-5">
      <PageHeader title={t('mig.title')} subtitle={t('mig.subtitle')} />
      {real === 0 && !rep ? (
        <Banner tone="info" title={t('mig.none.title')}>{t('mig.none.text')}</Banner>
      ) : (
        <>
          <Card>
            <CardHeader title={t('mig.found')} subtitle={t('mig.found.hint')} />
            <dl className="grid grid-cols-2 gap-3 px-5 pb-5 text-sm sm:grid-cols-3" data-mig-counts>
              {COLLS.map((c) => (
                <div key={c} className="rounded-lg border border-line px-3 py-2">
                  <dt className="text-xs text-ink-soft">{t(`mig.coll.${c}`)}</dt>
                  <dd className="tabular text-lg font-semibold">{plan?.records[c]?.length ?? 0}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-2 px-5 pb-5 text-sm text-ink-soft">
              <p>{t('mig.skippedDemo', { n: plan?.skipped?.demo ?? 0 })}</p>
              {(plan?.skipped?.orphanOffers ?? 0) > 0 && <p>{t('mig.skippedOrphans', { n: plan.skipped.orphanOffers })}</p>}
              {(plan?.warnings ?? []).slice(0, 5).map((w, i) => <p key={i} className="text-amber-800">{t('mig.warn.demo_dependency', { id: w.id })}</p>)}
            </div>
          </Card>
          {plan?.blockers?.length > 0 && <Banner tone="bad" title={t('mig.blocked')}>{plan.blockers.map((b) => b.message ?? String(b)).join('; ')}</Banner>}
          {!rep?.ok && (
            <Card>
              <div className="space-y-3 p-5">
                <p className="text-sm">{t('mig.explain')}</p>
                <Checkbox label={t('mig.confirm')} checked={agree} onChange={(e) => setAgree(e.target.checked)} data-mig-confirm />
                <Button variant="primary" loading={run.busy} disabled={!agree || run.busy || plan?.blockers?.length > 0 || !plan?.total} onClick={start} data-mig-start>
                  {rep ? t('mig.retry') : t('mig.start')}
                </Button>
                {p && <p role="status" className="text-sm text-ink-soft" data-mig-progress>{t(`mig.phase.${p.phase}`)} {p.coll ? `· ${t(`mig.coll.${p.coll}`)}` : ''} {p.total ? `· ${p.done}/${p.total}` : ''}</p>}
              </div>
            </Card>
          )}
          {rep && (
            <Card data-mig-report>
              <CardHeader title={t('mig.report')} />
              <div className="space-y-3 px-5 pb-5 text-sm">
                {rep.ok ? (
                  <Banner tone="ok" title={t('mig.verified')}>{t('mig.verified.text', { n: rep.verified ?? plan.total, files: rep.files?.verified ?? 0 })}</Banner>
                ) : (
                  <Banner tone="bad" title={t('mig.failed')}>{t('mig.failed.text')}</Banner>
                )}
                {(rep.failed ?? []).map((f, i) => <p key={i} className="break-words text-bad">{t(`mig.coll.${f.coll}`)}: {f.error}</p>)}
                {(rep.missing ?? []).length > 0 && <p className="text-bad">{t('mig.missing', { n: rep.missing.length })}</p>}
                {rep.ok && (
                  <div className="border-t border-line pt-3">
                    <p className="mb-2 text-ink-soft">{t('mig.deleteLocal.text')}</p>
                    <Button variant="danger" onClick={() => setWipe(true)} data-mig-delete-local>{t('mig.deleteLocal')}</Button>
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      )}
      <ConfirmDialog open={wipe} title={t('mig.deleteLocal')} text={t('mig.deleteLocal.confirm')} confirmLabel={t('common.delete')} onConfirm={deleteLocal} onClose={() => setWipe(false)} />
    </div>
  );
}
