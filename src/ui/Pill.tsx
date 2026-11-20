import type { ReactNode } from 'react';

const TONE = { offline: 'glass-dark pill-offline', warning: 'pill-warning', info: 'glass pill-info' };

export function Pill({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return <div role="status" className={`pill ${TONE[tone]}`}>{children}</div>;
}
