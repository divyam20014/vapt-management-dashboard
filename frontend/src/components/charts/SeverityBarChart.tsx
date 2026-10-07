import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SEVERITIES, SEVERITY_COUNT_KEYS, SEVERITY_STYLES, UNCLASSIFIED_LABEL } from '../../utils/constants';
import type { SeverityCounts } from '../../types/scan';

export default function SeverityBarChart({ counts, height = 240 }: { counts: SeverityCounts; height?: number }) {
  const data: { label: string; count: number; fill: string }[] = SEVERITIES.map((severity) => ({
    label: severity,
    count: counts[SEVERITY_COUNT_KEYS[severity]],
    fill: SEVERITY_STYLES[severity].fill,
  }));
  if (counts.unclassified) data.push({ label: UNCLASSIFIED_LABEL, count: counts.unclassified, fill: '#cbd5e1' });

  return (
    <div style={{ height }} role="img" aria-label={`Findings by severity: ${data.map((d) => `${d.label} ${d.count}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value) => [value, 'Findings']} />
          <Bar dataKey="count" name="Findings" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
