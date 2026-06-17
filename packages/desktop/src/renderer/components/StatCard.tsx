import type { JSX, ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}

export function StatCard({ label, value, sub }: StatCardProps): JSX.Element {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {sub != null ? <div className="stat__sub">{sub}</div> : null}
    </div>
  );
}
