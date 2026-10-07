import { useId, useRef, useState, type DragEvent } from 'react';
import { FileText, Upload, X } from 'lucide-react';

interface FileDropzoneProps {
  files: File[];
  accept: string[];
  maxSizeMb: number;
  maxFiles: number;
  disabled?: boolean;
  onChange: (files: File[]) => void;
  onReject: (message: string | null) => void;
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

export default function FileDropzone({ files, accept, maxSizeMb, maxFiles, disabled, onChange, onReject }: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const add = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      const error = checkFile(file, accept, maxSizeMb);
      if (error) problems.push(error);
      else if (!files.some((f) => f.name === file.name && f.size === file.size)) accepted.push(file);
    }
    const next = [...files, ...accepted];
    if (next.length > maxFiles) {
      problems.push(`Select at most ${maxFiles} reports at a time.`);
      next.length = maxFiles;
    }
    onReject(problems.length ? problems.join(' ') : null);
    onChange(next);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) add(event.dataTransfer.files);
  };

  const remove = (index: number) => onChange(files.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      {files.length > 0 && (
        <ul className="space-y-2" aria-label="Selected reports">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5">
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
                  onClick={() => remove(index)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  aria-label={files.length === 1 ? 'Remove selected file' : `Remove ${file.name}`}
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.length < maxFiles && !disabled && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 text-center transition-colors ${
            files.length ? 'py-5' : 'py-10'
          } ${dragging ? 'border-teal-600 bg-teal-50' : 'border-slate-300 bg-white'}`}
          data-testid="dropzone"
        >
          {!files.length && <Upload className="mb-3 size-8 text-slate-400" aria-hidden />}
          <p className="text-sm text-slate-700">
            {files.length ? 'Add more reports: drag and drop, or ' : 'Drag and drop one or more reports here, or '}
            <label htmlFor={inputId} className="cursor-pointer font-medium text-teal-700 hover:text-teal-800">
              browse
            </label>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {accept.join(', ')} · up to {maxSizeMb} MB each · up to {maxFiles} files
          </p>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            className="sr-only"
            accept={accept.join(',')}
            aria-label="Report file"
            onChange={(event) => {
              add(event.target.files);
              if (inputRef.current) inputRef.current.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
