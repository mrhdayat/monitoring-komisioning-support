import type { ReactNode } from 'react';
import { Count } from './Count';

export function ProgressCard({ done, total, sub }: { done: number; total: number; sub?: ReactNode }) {
  const frac = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <section className="progress">
      <p className="progress-num"><Count value={done} /><small> / {total}</small></p>
      {sub && <p className="progress-sub">{sub}</p>}
      <div className="progress-strip" aria-hidden="true"><i style={{ transform: `scaleX(${frac})` }} /></div>
    </section>
  );
}
