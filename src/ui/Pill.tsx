import type { ReactNode } from 'react';

// Pita pesan hitam di atas layar (offline, error, sukses); warna kotak kecil menandai jenisnya.
export function Pill({ tone, children }: { tone: 'offline' | 'warning' | 'info'; children: ReactNode }) {
  return <div role="status" className={`banner banner-${tone}`}>{children}</div>;
}
