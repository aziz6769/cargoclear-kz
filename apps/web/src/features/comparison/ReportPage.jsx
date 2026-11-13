import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Printer, ShieldCheck } from 'lucide-react';
import { COST_COMPONENTS, buildAnalysis, comparisonToCsv } from '@cargoclear/core';
import { useApp } from '../../app/DataContext.jsx';
import { Button, EmptyState } from '../../components/ui.jsx';
import { ComparabilityBadge, StatusBadge, route } from '../../components/common.jsx';
import { downloadText, safeFilename } from '../../lib/download.js';
import { ExplainPanel } from './Analysis.jsx';

const H = ({ children }) => <h2 className="mb-2 mt-7 border-b border-line pb-1.5 text-base font-bold text-navy break-after-avoid">{children}</h2>;

/** Printable report. Use the browser's Print → Save as PDF. */
export default function ReportPage() {
  const { id } = useParams();
  const { views, t, fmt, lang, notify } = useApp();
  const navigate = useNavigate();
  const view = views.find((v) => v.comparison.id === id);
  if (!view)
    return (
      <div className="p-8">
        <EmptyState title={t('res.notFound')} action={<Button variant="primary" onClick={() => navigate('/history')}>{t('nav.history')}</Button>} />
      </div>
    );

  const { shipment: s, entries, result, comparison } = view;
  const a = buildAnalysis(view);
  const name = (e) => e.carrier?.name ?? '—';
  const money = (v, c) => fmt.money(v, c);
  const shownComponents = COST_COMPONENTS.filter((k) => entries.some((e) => e.analysis.rows.find((r) => r.key === k)?.state !== 'na'));
  const stateCell = (r, cur) =>
    r.state === 'charged' || r.state === 'extra' ? money(r.amount, cur) : t(`state.${r.state}`);
  const th = 'border border-line bg-canvas px-2 py-1.5 text-left align-bottom text-xs font-semibold';
  const td = 'border border-line px-2 py-1.5 align-top text-xs';

  return (
    <div className="min-h-screen bg-canvas py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 print:hidden">
        <Button icon={ArrowLeft} onClick={() => navigate(`/comparisons/${id}`)}>{t('common.back')}</Button>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            icon={FileDown}
            className="min-w-0 flex-1 !h-auto !shrink !whitespace-normal py-2.5 leading-tight sm:flex-none"
            onClick={() => {
              downloadText(`cargoclear-${safeFilename(comparison.name)}.csv`, comparisonToCsv(view, t, lang));
              notify('ok', t('res.csvDone'));
            }}
          >
            {t('res.exportCsv')}
          </Button>
          <Button variant="primary" icon={Printer} className="min-w-0 flex-1 !h-auto !shrink !whitespace-normal py-2.5 leading-tight sm:flex-none" onClick={() => window.print()}>{t('rep.print')}</Button>
        </div>
      </div>

      <article className="mx-auto max-w-4xl rounded-card bg-white px-5 py-6 shadow-card print:max-w-none print:rounded-none print:p-0 print:shadow-none sm:px-8" data-report>
        <header className="flex items-start justify-between gap-4 border-b-2 border-navy pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-white"><ShieldCheck size={22} /></span>
            <div>
              <div className="text-lg font-bold tracking-tight text-navy">CargoClear <span className="text-teal">KZ</span></div>
              <div className="text-xs text-ink-soft">{t('rep.tagline')}</div>
            </div>
          </div>
          <div className="text-right text-xs text-ink-soft">
            <div className="font-semibold text-ink">{t('rep.title')}</div>
            <div>{t('rep.generated')}: {fmt.date(new Date().toISOString())}</div>
          </div>
        </header>

        <h1 className="mt-5 text-xl font-bold">{comparison.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          {route(s)} <StatusBadge status={result.status} />
          {comparison.isDemo && <span className="rounded bg-canvas px-1.5 py-0.5 text-xs font-semibold uppercase">{t('common.demo')}</span>}
        </div>

        <H>{t('rep.shipment')}</H>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {[
            [t('ship.name'), s.name],
            [t('csv.route'), route(s)],
            [t('ship.deliveryPoint'), s.deliveryPoint],
            [t('ship.category'), t(`cat.${s.category}`)],
            [t('ship.weight'), s.weightKg],
            [t('ship.volume'), s.volumeM3],
            [t('ship.packages'), s.packages],
            [t('res.target'), t(`endpoint.${s.deliveryLevel}`)],
            ...(s.cargoDescription ? [[t('ship.cargoDescription'), s.cargoDescription]] : []),
            ...(s.requiredDate ? [[t('ship.requiredDate'), fmt.date(s.requiredDate)]] : []),
            ...(s.requirements ? [[t('ship.requirements'), s.requirements]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2"><dt className="w-40 shrink-0 text-ink-soft">{k}</dt><dd className="min-w-0 break-words font-medium">{v}</dd></div>
          ))}
        </dl>

        <H>{t('rep.table')}</H>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[t('csv.carrier'), t('csv.quoted'), t('csv.confirmedExtra'), t('csv.knownCost'), t('res.final'), t('csv.endpoint'), t('offer.days'), t('res.status'), t('csv.unknownCount')].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.offer.id}>
                  <td className={`${td} font-semibold`}>{name(e)}</td>
                  <td className={`${td} tabular`}>{money(e.analysis.price, e.offer.currency)}</td>
                  <td className={`${td} tabular`}>{money(Math.round((e.analysis.lowerBound - (e.analysis.price ?? 0)) * 100) / 100, e.offer.currency)}</td>
                  <td className={`${td} tabular`}>{money(e.analysis.lowerBound, e.offer.currency)}</td>
                  <td className={`${td} tabular font-semibold`}>{e.item.total !== null ? money(e.item.total) : t('res.infoRequired')}</td>
                  <td className={td}>{t(`endpoint.${e.offer.endpoint}`)}{e.offer.endpointLabel ? `, ${e.offer.endpointLabel}` : ''}</td>
                  <td className={`${td} tabular`}>{e.analysis.deliveryDays ?? '—'}</td>
                  <td className={td}><ComparabilityBadge value={e.item.comparability} /></td>
                  <td className={`${td} tabular`}>{e.analysis.missing.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H>{t('rep.breakdown')}</H>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}> </th>
                {entries.map((e) => <th key={e.offer.id} className={th}>{name(e)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><th className={`${td} text-left font-medium`}>{t('comp.base')}</th>{entries.map((e) => <td key={e.offer.id} className={`${td} tabular`}>{e.analysis.price === null ? t('state.unknown') : money(e.analysis.price, e.offer.currency)}</td>)}</tr>
              {shownComponents.map((k) => (
                <tr key={k}>
                  <th className={`${td} text-left font-medium`}>{t(`comp.${k}`)}</th>
                  {entries.map((e) => <td key={e.offer.id} className={`${td} tabular`}>{stateCell(e.analysis.rows.find((r) => r.key === k), e.offer.currency)}</td>)}
                </tr>
              ))}
              <tr>
                <th className={`${td} text-left font-medium`}>{t('comp.additional')}</th>
                {entries.map((e) => (
                  <td key={e.offer.id} className={`${td} tabular`}>
                    {e.analysis.additional.items.length === 0 ? '—' : e.analysis.additional.items.map((c, i) => <div key={i}>{c.name}: {c.amount === null ? t('state.unknown') : money(c.amount, e.offer.currency)}</div>)}
                  </td>
                ))}
              </tr>
              <tr className="bg-canvas">
                <th className={`${td} text-left font-semibold`}>{t('res.known')}</th>
                {entries.map((e) => <td key={e.offer.id} className={`${td} tabular font-semibold`}>{money(e.analysis.lowerBound, e.offer.currency)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-ink-soft">{t('rep.unknownNote')}</p>

        <H>{t('rep.analysis')}</H>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{a.best ? t('an.lowest', { carrier: name(a.best), amount: money(result.bestTotal), n: a.comparableCount, total: a.total }) : t('an.noneComparable')}</li>
          {a.lowestQuoteNotBest && <li>{t('an.lowestQuote', { carrier: name(a.baseCheapest), best: name(a.best) })}</li>}
          {a.withMissing.length > 0 && <li>{t('an.missing', { list: a.withMissing.map((m) => `${name(m.entry)} (${m.count})`).join(', ') })}</li>}
          {a.mismatched.length > 0 && <li>{t('an.mismatch', { list: a.mismatched.map(name).join(', ') })}</li>}
        </ul>
        <p className="mt-1 text-xs text-ink-soft">{t('an.disclaimer')}</p>

        <H>{t('rep.missing')}</H>
        {entries.every((e) => e.questions.length === 0) ? (
          <p className="text-sm text-ok">{t('res.noQuestions')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {entries.filter((e) => e.questions.length > 0).map((e) => (
              <div key={e.offer.id} className="break-inside-avoid text-sm">
                <div className="font-semibold">{name(e)}</div>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {e.questions.map((q) => <li key={q.id}>{t(q.key, q.params)}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}

        <H>{t('rep.calc')}</H>
        <div className="space-y-4">
          {entries.map((e) => (
            <div key={e.offer.id} className="break-inside-avoid">
              <div className="mb-1 text-sm font-semibold">{name(e)}</div>
              <ExplainPanel e={e} result={result} />
            </div>
          ))}
        </div>

        <H>{t('rep.method')}</H>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => <li key={n}>{t(`rep.method.${n}`)}</li>)}
        </ol>

        <footer className="mt-8 border-t border-line pt-3 text-xs text-ink-soft">
          <p>{t('rep.localNote')}</p>
          {comparison.isDemo && <p className="mt-1 font-medium">{t('rep.demoNote')}</p>}
          <p className="mt-1">CargoClear KZ · {fmt.date(new Date().toISOString())} · <Link to="/" className="inline-flex min-h-[44px] items-center underline print:hidden">{t('nav.dashboard')}</Link></p>
        </footer>
      </article>
    </div>
  );
}
