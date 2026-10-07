import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SEVERITIES, SEVERITY_COUNT_KEYS, SEVERITY_STYLES, UNCLASSIFIED_LABEL } from '../../utils/constants';
import type { ProjectFindings } from '../../types/dashboard';

/** Findings per project, stacked by severity. */
export default function ProjectSeverityChart({ rows }: { rows: ProjectFindings[] }) {
  const data = rows.map((row) => ({
    name: row.project_name,
    ...Object.fromEntries(SEVERITIES.map((s) => [s, row.severity[SEVERITY_COUNT_KEYS[s]]])),
    [UNCLASSIFIED_LABEL]: row.severity.unclassified,
  }));
  const hasUnclassified = rows.some((row) => row.severity.unclassified > 0);
  const height = Math.max(160, rows.length * 36 + 60);

  return (
    <div style={{ height }} role="img" aria-label={`Findings by project: ${rows.map((r) => `${r.project_name} ${r.total}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {SEVERITIES.map((severity) => (
            <Bar key={severity} dataKey={severity} stackId="severity" fill={SEVERITY_STYLES[severity].fill} maxBarSize={22} />
          ))}
          {hasUnclassified && <Bar dataKey={UNCLASSIFIED_LABEL} stackId="severity" fill="#cbd5e1" maxBarSize={22} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
