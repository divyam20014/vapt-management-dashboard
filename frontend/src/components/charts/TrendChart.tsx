import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Trends } from '../../types/dashboard';

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const shortMonth = new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' });

function label(period: string, granularity: Trends['granularity']) {
  const date = new Date(granularity === 'month' ? `${period}-01T00:00:00Z` : `${period}T00:00:00Z`);
  return (granularity === 'month' ? shortMonth : shortDate).format(date);
}

/** Findings first detected vs. resolved/closed per period, from SQLite. */
export default function TrendChart({ trends, height = 260 }: { trends: Trends; height?: number }) {
  const data = trends.points.map((point) => ({ ...point, label: label(point.period, trends.granularity) }));
  const totals = data.reduce((acc, p) => [acc[0] + p.discovered, acc[1] + p.resolved], [0, 0]);
  return (
    <div
      style={{ height }}
      role="img"
      aria-label={`Per ${trends.granularity}: ${totals[0]} findings discovered and ${totals[1]} resolved or closed in total`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="discovered" name="Discovered" fill="#ea580c" radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Bar dataKey="resolved" name="Resolved / closed" fill="#0f766e" radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
