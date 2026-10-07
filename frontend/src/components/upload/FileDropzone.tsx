import { useId, useRef, useState, type DragEvent } from 'react';
import { FileText, Upload, X } from 'lucide-react';

interface FileDropzoneProps {
  file: File | null;
  accept: string[];
  maxSizeMb: number;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
  onReject: (message: string) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Client-side checks are a convenience only; the server validates every upload again. */
export function checkFile(file: File, accept: string[], maxSizeMb: number): string | null {
  const dot = file.name.lastIndexOf('.');
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!accept.includes(extension)) return `"${file.name}" is not a supported file type. Allowed: ${accept.join(', ')}.`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > maxSizeMb * 1024 * 1024) return `"${file.name}" is larger than the ${maxSizeMb} MB limit.`;
  return null;
}

export default function FileDropzone({ file, accept, maxSizeMb, disabled, onSelect, onReject }: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      onReject('Select one report at a time. Bulk upload is not available yet.');
      return;
    }
    const error = checkFile(files[0], accept, maxSizeMb);
    if (error) onReject(error);
    else onSelect(files[0]);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) take(event.dataTransfer.files);
  };

  if (file) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="size-5 shrink-0 text-teal-700" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
            <p className="text-xs text-slate-500">{formatSize(file.size)}</p>
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label="Remove selected file"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
        dragging ? 'border-teal-600 bg-teal-50' : 'border-slate-300 bg-white'
      }`}
      data-testid="dropzone"
    >
      <Upload className="mb-3 size-8 text-slate-400" aria-hidden />
      <p className="text-sm text-slate-700">
        Drag and drop a report here, or{' '}
        <label htmlFor={inputId} className="cursor-pointer font-medium text-teal-700 hover:text-teal-800">
          browse
        </label>
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {accept.join(', ')} · up to {maxSizeMb} MB
      </p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept={accept.join(',')}
        disabled={disabled}
        aria-label="Report file"
        onChange={(event) => {
          take(event.target.files);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
    </div>
  );
}
