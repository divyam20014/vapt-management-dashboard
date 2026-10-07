import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../ui/Card';
import { findingService } from '../../services/findingService';
import { toApiError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { DUPLICATE_DECISIONS, PERMISSIONS } from '../../utils/constants';
import { findingPath } from '../../utils/routes';
import type { FindingDetail } from '../../types/finding';

/** Pairs flagged by the application. A person may keep a pair separate; findings are never merged here. */
export default function PossibleDuplicates({ finding, onSaved }: { finding: FindingDetail; onSaved: (updated: FindingDetail) => void }) {
  const canDecide = useAuth().can(PERMISSIONS.duplicatesDecide);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (finding.potential_duplicates.length === 0) return null;

  const decide = async (pairId: number, decision: string) => {
    setBusyId(pairId);
    setError(null);
    try {
      onSaved(await findingService.decideDuplicate(finding.id, pairId, decision));
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card title="Possible duplicates" description="Suggested by the application; not merged.">
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {finding.potential_duplicates.map((d) => (
          <li key={d.id} className="text-sm">
            <Link to={findingPath(d.other_finding_id)} className="font-medium text-teal-700 hover:text-teal-800">
              {d.other_title}
            </Link>
            <p className="text-xs text-slate-500">
              {d.other_source} · {d.confidence} confidence · {d.decision}
            </p>
            <p className="text-xs text-slate-600">{d.reason}</p>
            {canDecide && (
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void decide(d.id, d.decision === DUPLICATE_DECISIONS.pending ? DUPLICATE_DECISIONS.keptSeparate : DUPLICATE_DECISIONS.pending)}
                className="mt-1 text-xs font-medium text-teal-700 hover:text-teal-800 disabled:opacity-50"
              >
                {d.decision === DUPLICATE_DECISIONS.pending ? 'Keep separate' : 'Undo decision'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
