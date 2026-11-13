import { Card, cx } from './ui.jsx';

export const Skel = ({ className, style }) => <div aria-hidden="true" style={style} className={cx('animate-pulse rounded-md bg-slate-200/70', className)} />;

export function ChartSkeleton({ height = 300 }) {
  return (
    <Card className="min-w-0 p-5" role="status" aria-busy="true">
      <Skel className="h-4 w-40" />
      <Skel className="mt-2 h-3 w-56" />
      <Skel className="mt-6 w-full" style={{ height }} />
    </Card>
  );
}

/** Route-level loading placeholder: header + cards, same rhythm as real pages so nothing jumps. */
export function PageSkeleton() {
  return (
    <div role="status" aria-busy="true" data-skeleton>
      <Skel className="h-7 w-56" />
      <Skel className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-4"><Skel className="h-3 w-24" /><Skel className="mt-3 h-7 w-16" /></Card>
        ))}
      </div>
      <Card className="mt-6 p-5">
        <Skel className="h-4 w-48" />
        {[0, 1, 2, 3].map((i) => <Skel key={i} className="mt-4 h-10 w-full" />)}
      </Card>
    </div>
  );
}
