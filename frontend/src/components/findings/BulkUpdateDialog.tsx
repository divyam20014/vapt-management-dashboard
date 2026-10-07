import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { TextAreaField } from '../ui/FormField';
import { findingService } from '../../services/findingService';
import { toApiError } from '../../services/api';
import { FINDING_STATUSES, type FindingStatus } from '../../utils/constants';
import type { BulkUpdateResult, FindingChange } from '../../types/finding';
import type { User } from '../../types/user';

const KEEP = '__keep__';
const UNASSIGN = '__none__';
const CONTROL =
  'block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none';

interface BulkUpdateDialogProps {
  open: boolean;
  findingIds: number[];
  users: User[];
  actingUser: User | null;
  onClose: () => void;
  onDone: (result: BulkUpdateResult) => void;
}

/** One transactional request: every selected finding is updated, or none is. */
export default function BulkUpdateDialog({ open, findingIds, users, actingUser, onClose, onDone }: BulkUpdateDialogProps) {
  const [status, setStatus] = useState<string>(KEEP);
  const [assignee, setAssignee] = useState<string>(KEEP);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStatus(KEEP);
      setAssignee(KEEP);
      setComment('');
      setError(null);
    }
  }, [open]);

  const nothingChosen = status === KEEP && assignee === KEEP;
  const count = findingIds.length;

  const submit = async () => {
    const change: FindingChange = {};
    if (status !== KEEP) change.status = status as FindingStatus;
    if (assignee !== KEEP) change.assigned_to = assignee === UNASSIGN ? null : Number(assignee);
    if (comment.trim()) change.comment = comment.trim();
    setBusy(true);
    setError(null);
    try {
      onDone(await findingService.bulkUpdate(findingIds, change));
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Update ${count} selected finding${count === 1 ? '' : 's'}`}
      description="All selected findings are updated together. If any update fails, none are changed."
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={nothingChosen || !actingUser}>
            Update {count} finding{count === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!actingUser && (
          <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Choose who you are acting as (top bar) so the change can be recorded.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bulk-status" className="mb-1.5 block text-sm font-medium text-slate-700">
              New status
            </label>
            <select id="bulk-status" value={status} onChange={(event) => setStatus(event.target.value)} className={CONTROL}>
              <option value={KEEP}>Keep current status</option>
              {FINDING_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bulk-assignee" className="mb-1.5 block text-sm font-medium text-slate-700">
              Assign to
            </label>
            <select id="bulk-assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)} className={CONTROL}>
              <option value={KEEP}>Keep current assignee</option>
              <option value={UNASSIGN}>Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <TextAreaField
          label="Comment"
          hint="Recorded in each finding's status history."
          maxLength={2000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
