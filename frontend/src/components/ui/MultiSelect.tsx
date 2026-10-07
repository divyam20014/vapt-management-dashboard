import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  emptyText?: string;
}

/** Compact checkbox dropdown for multi-value filters. */
export default function MultiSelect({ label, options, selected, onChange, disabled, emptyText = 'No options' }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);

  const summary =
    selected.length === 0
      ? 'All'
      : selected.length === 1
        ? (options.find((option) => option.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className={`inline-flex w-full items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-left text-sm ring-1 ring-inset focus:ring-2 focus:ring-teal-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
          selected.length ? 'ring-teal-600 text-slate-900' : 'ring-slate-300 text-slate-700'
        }`}
      >
        <span className="truncate">
          <span className="text-slate-500">{label}:</span> {summary}
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="absolute z-40 mt-1 max-h-72 w-full min-w-48 overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-slate-200"
        >
          {options.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">{emptyText}</p>}
          {options.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                className="size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
              {option.label}
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="w-full border-t border-slate-100 px-3 py-1.5 text-left text-xs font-medium text-teal-700 hover:bg-slate-50">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
