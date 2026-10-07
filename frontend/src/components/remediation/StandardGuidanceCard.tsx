import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import Card from '../ui/Card';
import { guidelinePath } from '../../utils/routes';
import type { StandardGuidanceRef } from '../../types/remediation';

/**
 * Application guidance from the remediation library, kept visibly separate from the report's own
 * "Original recommendation". Shown only when a guideline matches by exact scanner rule or CWE.
 */
export default function StandardGuidanceCard({ guidance }: { guidance: StandardGuidanceRef[] }) {
  return (
    <Card
      title="Standard remediation guidance"
      description="From the application's remediation library, not from the scanner report. The original recommendation is unchanged."
    >
      {guidance.length === 0 ? (
        <p className="text-sm text-slate-500">
          No library guideline matches this finding's scanner rule or CWE. Use the original recommendation, or search the{' '}
          <Link to="/remediation" className="font-medium text-teal-700 hover:text-teal-800">
            remediation library
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-4">
          {guidance.map((g) => (
            <li key={g.slug} className="text-sm">
              <Link to={guidelinePath(g.slug)} className="inline-flex items-center gap-1.5 font-medium text-teal-700 hover:text-teal-800">
                <BookOpen className="size-4 shrink-0" aria-hidden />
                {g.title}
              </Link>
              <p className="mt-1 text-slate-600">{g.summary}</p>
              <p className="mt-1 text-xs text-slate-500">
                {g.match_type === 'scanner_rule' ? (
                  <>Matched by scanner rule: {g.basis}</>
                ) : (
                  <>Matched by {g.basis} only. Check that the guidance fits this finding.</>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
