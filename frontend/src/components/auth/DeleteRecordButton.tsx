import { useState, type ReactNode } from 'react';
import { Trash } from 'lucide-react';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useAuth } from '../../hooks/useAuth';
import { toApiError } from '../../services/api';
import { PERMISSIONS } from '../../utils/constants';

interface DeleteRecordButtonProps {
  label: string;
  title: string;
  message: ReactNode;
  onDelete: () => Promise<unknown>;
  onDeleted: () => void;
}

/** Admin-only deletion with confirmation. Renders nothing for other roles (the API refuses them too). */
export default function DeleteRecordButton({ label, title, message, onDelete, onDeleted }: DeleteRecordButtonProps) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!can(PERMISSIONS.recordsDelete)) return null;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      setOpen(false);
      onDeleted();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        icon={<Trash className="size-4" aria-hidden />}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <ConfirmDialog open={open} title={title} message={message} confirmLabel={label} busy={busy} error={error} onConfirm={() => void confirm()} onCancel={() => setOpen(false)} />
    </>
  );
}
