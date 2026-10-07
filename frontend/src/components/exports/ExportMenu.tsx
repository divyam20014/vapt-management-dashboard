import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import Button from '../ui/Button';
import { exportService, type ExportFormat } from '../../services/exportService';
import { toApiError } from '../../services/api';
import type { FindingQuery } from '../../types/finding';

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'csv', label: 'CSV' },
  { format: 'xlsx', label: 'Excel (XLSX)' },
  { format: 'json', label: 'JSON' },
];

interface ExportMenuProps {
  query: FindingQuery;
  total: number;
}

/** Exports exactly the findings the current filters show (all pages). */
export default function ExportMenu({ query, total }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const run = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(true);
    setError(null);
    const { page: _page, page_size: _size, ...filters } = query;
    try {
      await exportService.findings(filters, format);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="secondary"
        size="sm"
        icon={<Download className="size-4" aria-hidden />}
        loading={busy}
        disabled={total === 0}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Export {total} finding{total === 1 ? '' : 's'}
        <ChevronDown className="size-4" aria-hidden />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-44 rounded-md bg-white py-1 shadow-lg ring-1 ring-slate-200">
          {FORMATS.map(({ format, label }) => (
            <button key={format} role="menuitem" type="button" onClick={() => void run(format)} className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">
              {label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="absolute right-0 mt-1 w-64 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
          {error}
        </p>
      )}
    </div>
  );
}
