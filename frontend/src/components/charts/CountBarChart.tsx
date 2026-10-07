import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CountByLabel } from '../../types/dashboard';

interface CountBarChartProps {
  data: CountByLabel[];
  valueLabel: string;
  height?: number;
  color?: string;
}

/** Horizontal bar chart for label/count aggregates returned by the API. */
export default function CountBarChart({ data, valueLabel, height = 220, color = '#0f766e' }: CountBarChartProps) {
  return (
    <div style={{ height }} role="img" aria-label={`${valueLabel}: ${data.map((d) => `${d.label} ${d.count}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={96} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value) => [value, valueLabel]} />
          <Bar dataKey="count" name={valueLabel} fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
