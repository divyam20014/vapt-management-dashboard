import { useEffect, useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { TextAreaField } from '../ui/FormField';
import { findingService } from '../../services/findingService';
import { toApiError } from '../../services/api';
import { useUsers } from '../../hooks/useUsers';
import { useAuth } from '../../hooks/useAuth';
import { FindingStatusBadge } from './Badges';
import { FINDING_STATUSES, PERMISSIONS, type FindingStatus } from '../../utils/constants';
import type { FindingDetail } from '../../types/finding';

const CONTROL =
  'block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none disabled:bg-slate-50';

/** Status and assignment. The server is the source of truth: the page shows what the API returns. */
export default function FindingWorkflow({ finding, onSaved }: { finding: FindingDetail; onSaved: (updated: FindingDetail) => void }) {
  if (!useAuth().can(PERMISSIONS.findingsUpdate)) {
    return (
      <Card title="Remediation">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="mt-1">
              <FindingStatusBadge status={finding.status} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Assignee</dt>
            <dd className="mt-1 text-slate-900">{finding.assignee?.name ?? 'Unassigned'}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">Your role can view findings but not change them.</p>
      </Card>
    );
  }
  return <WorkflowEditor finding={finding} onSaved={onSaved} />;
}

function WorkflowEditor({ finding, onSaved }: { finding: FindingDetail; onSaved: (updated: FindingDetail) => void }) {
  const { activeUsers } = useUsers();
  const [status, setStatus] = useState<FindingStatus>(finding.status);
  const [assignee, setAssignee] = useState<string>(finding.assignee ? String(finding.assignee.id) : '');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setStatus(finding.status);
    setAssignee(finding.assignee ? String(finding.assignee.id) : '');
  }, [finding]);

  const currentAssignee = finding.assignee ? String(finding.assignee.id) : '';
  const statusChanged = status !== finding.status;
  const assigneeChanged = assignee !== currentAssignee;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await findingService.update(finding.id, {
        ...(statusChanged ? { status } : {}),
        ...(assigneeChanged ? { assigned_to: assignee ? Number(assignee) : null } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setComment('');
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  // Keep an inactive current assignee visible in the list.
  const assigneeOptions = finding.assignee && !activeUsers.some((u) => u.id === finding.assignee!.id)
    ? [...activeUsers, { id: finding.assignee.id, name: `${finding.assignee.name} (inactive)` }]
    : activeUsers;

  return (
    <Card title="Remediation">
      <div className="space-y-4">
        <div>
          <label htmlFor="finding-status" className="mb-1.5 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select id="finding-status" value={status} disabled={busy} onChange={(event) => setStatus(event.target.value as FindingStatus)} className={CONTROL}>
            {FINDING_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="finding-assignee" className="mb-1.5 block text-sm font-medium text-slate-700">
            Assignee
          </label>
          <select id="finding-assignee" value={assignee} disabled={busy} onChange={(event) => setAssignee(event.target.value)} className={CONTROL}>
            <option value="">Unassigned</option>
            {assigneeOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
        <TextAreaField
          label="Comment"
          hint="Saved with the status change in the history."
          maxLength={2000}
          value={comment}
          disabled={busy}
          onChange={(event) => setComment(event.target.value)}
        />
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {saved && !statusChanged && !assigneeChanged && (
          <p role="status" className="text-sm text-emerald-700">
            Saved.
          </p>
        )}
        <Button className="w-full" onClick={save} loading={busy} disabled={!statusChanged && !assigneeChanged}>
          Save changes
        </Button>
      </div>
    </Card>
  );
}
