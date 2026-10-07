import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, FileCode } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import FindingWorkflow from '../components/findings/FindingWorkflow';
import PossibleDuplicates from '../components/findings/PossibleDuplicates';
import StandardGuidanceCard from '../components/remediation/StandardGuidanceCard';
import DeleteRecordButton from '../components/auth/DeleteRecordButton';
import { FindingStatusBadge, SeverityBadge } from '../components/findings/Badges';
import { findingService } from '../services/findingService';
import { toApiError } from '../services/api';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { NOT_EXTRACTED, NOT_PROVIDED, UNCLASSIFIED_LABEL } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import { ROUTES, projectPath } from '../utils/routes';
import type { FindingDetail, OccurrenceRaw } from '../types/finding';

const missing = <span className="text-slate-400 italic">{NOT_PROVIDED}</span>;
const unextracted = (
  <span className="text-amber-700 italic" title="The report layout should contain this value, but it could not be read reliably.">
    {NOT_EXTRACTED}
  </span>
);

/** `unreadable`: the report layout should contain the value but it could not be read (e.g. from a PDF). */
function show(value: ReactNode | null | undefined, unreadable = false) {
  if (value !== null && value !== undefined && value !== '') return value;
  return unreadable ? unextracted : missing;
}

function Field({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className={`mt-1 text-sm break-words text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{children}</dd>
    </div>
  );
}

function TextBlock({ title, text, note, unreadable }: { title: string; text: string | null; note?: string; unreadable?: boolean }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      <div className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{show(text, unreadable)}</div>
    </section>
  );
}

/** Verbatim scanner output (evidence, commands). Rendered as text, never as HTML. */
function Verbatim({ title, text, note, unreadable }: { title: string; text: string | null; note?: string; unreadable?: boolean }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {text && (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(text)}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
            aria-label={`Copy ${title.toLowerCase()}`}
          >
            <Copy className="size-3.5" aria-hidden />
            Copy
          </button>
        )}
      </div>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      {text ? (
        <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-slate-900 p-3 font-mono text-xs whitespace-pre-wrap text-slate-100">{text}</pre>
      ) : (
        <p className="mt-1 text-sm">{unreadable ? unextracted : missing}</p>
      )}
    </section>
  );
}

function References({ text, unreadable }: { text: string | null; unreadable?: boolean }) {
  if (!text) return <p className="mt-1 text-sm">{unreadable ? unextracted : missing}</p>;
  return (
    <ul className="mt-1 space-y-1 text-sm">
      {text.split('\n').map((line, index) => (
        <li key={index} className="break-all">
          {/^https?:\/\//i.test(line.trim()) ? (
            <a href={line.trim()} target="_blank" rel="noopener noreferrer nofollow" className="text-teal-700 hover:text-teal-800">
              {line.trim()}
            </a>
          ) : (
            line
          )}
        </li>
      ))}
    </ul>
  );
}

export default function FindingDetailPage() {
  const { findingId } = useParams();
  const id = Number(findingId);
  const location = useLocation();
  const navigate = useNavigate();
  const backTo = (location.state as { from?: string } | null)?.from ?? ROUTES.findings;
  const { data, error, reload } = useApiQuery(() => findingService.get(id), [id]);
  const [current, setCurrent] = useState<FindingDetail | null>(null);
  const finding = current && current.id === id ? current : data;
  useDocumentTitle(finding?.normalized_title ?? 'Finding');

  const [raw, setRaw] = useState<OccurrenceRaw | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  const backLink = (
    <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="size-4" aria-hidden />
      Findings
    </Link>
  );

  if (error) {
    return (
      <>
        <PageHeader title="Finding" breadcrumb={backLink} />
        <Card>
          <ErrorState
            title={error.status === 404 ? 'Finding not found' : 'Finding could not be loaded'}
            message={error.message}
            onRetry={error.status === 404 ? undefined : reload}
          />
        </Card>
      </>
    );
  }
  if (!finding) {
    return (
      <Card>
        <LoadingState label="Loading finding…" />
      </Card>
    );
  }

  const openRaw = async (occurrenceId: number) => {
    setRawError(null);
    try {
      setRaw(await findingService.rawOccurrence(finding.id, occurrenceId));
    } catch (err) {
      setRawError(toApiError(err).message);
    }
  };

  const metadata = Object.entries(finding.source_metadata ?? {}).filter(([key]) => key !== 'not_extracted');
  const notExtracted = Array.isArray(finding.source_metadata?.not_extracted) ? (finding.source_metadata!.not_extracted as string[]) : [];
  const unreadable = (field: string) => notExtracted.includes(field);

  return (
    <>
      <PageHeader
        breadcrumb={backLink}
        title={finding.normalized_title}
        description={`${finding.project_name} · ${finding.source_tool}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.normalized_severity} original={finding.original_severity} />
            <FindingStatusBadge status={finding.status} />
            <DeleteRecordButton
              label="Delete finding"
              title="Delete finding"
              message={
                <>
                  <strong>{finding.normalized_title}</strong> will be removed with its {finding.occurrences.length} observation(s), status
                  history and duplicate suggestions. The uploaded reports are not changed. This cannot be undone and is recorded in the audit log.
                </>
              }
              onDelete={() => findingService.remove(finding.id)}
              onDeleted={() => navigate(backTo)}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Report values" description="Original values from the report, next to the values used by this application.">
            <div className="relative overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="py-2 pr-4">Field</th>
                    <th scope="col" className="py-2 pr-4">Original (report)</th>
                    <th scope="col" className="py-2">Normalized</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-600">Title</th>
                    <td className="py-2 pr-4 text-slate-900">{finding.original_title}</td>
                    <td className="py-2 text-slate-900">{finding.normalized_title}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-600">Severity</th>
                    <td className="py-2 pr-4 text-slate-900">{show(finding.original_severity)}</td>
                    <td className="py-2 text-slate-900">{finding.normalized_severity ?? `${UNCLASSIFIED_LABEL} (not on the standard scale)`}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Location">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Affected URL" mono>{show(finding.affected_url, unreadable('affected_url'))}</Field>
              <Field label="Endpoint" mono>{show(finding.endpoint, unreadable('endpoint'))}</Field>
              <Field label="HTTP method">{show(finding.http_method, unreadable('http_method'))}</Field>
              <Field label="Parameter" mono>{show(finding.parameter, unreadable('parameter'))}</Field>
            </dl>
          </Card>

          <Card title="Details">
            <div className="space-y-5">
              <TextBlock title="Description" text={finding.description} unreadable={unreadable('description')} />
              <TextBlock title="Impact" text={finding.impact} unreadable={unreadable('impact')} />
              <Verbatim title="Evidence" text={finding.evidence} note="Exactly as reported when the finding was first detected." unreadable={unreadable('evidence')} />
              <Verbatim title="Steps to reproduce" text={finding.steps_to_reproduce} />
              <TextBlock title="Original recommendation" text={finding.recommendation} note="From the scanner report." unreadable={unreadable('recommendation')} />
              <section>
                <h3 className="text-sm font-semibold text-slate-900">References</h3>
                <References text={finding.source_reference} unreadable={unreadable('source_reference')} />
              </section>
            </div>
          </Card>

          <Card title={`Observations (${finding.occurrences.length})`} description="Every time this finding appeared in an uploaded report, newest first." bodyClassName="">
            <div className="relative overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2">Scan</th>
                    <th scope="col" className="px-4 py-2">Location</th>
                    <th scope="col" className="px-4 py-2">Evidence</th>
                    <th scope="col" className="px-4 py-2"><span className="sr-only">Original record</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {finding.occurrences.map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-2 align-top">
                        <p className="font-medium text-slate-900">{o.scan_name}</p>
                        <p className="text-xs text-slate-500">
                          {[o.scanner, o.report_type].filter(Boolean).join(' ')} ·{' '}
                          {o.scan_date ? `scanned ${formatDateTime(o.scan_date)}` : `uploaded ${formatDateTime(o.uploaded_at)}`}
                        </p>
                      </td>
                      <td className="max-w-xs px-4 py-2 align-top font-mono text-xs break-all text-slate-700">
                        {o.http_method && <span className="mr-1 font-semibold">{o.http_method}</span>}
                        {o.affected_url ?? NOT_PROVIDED}
                        {o.parameter && <span className="block text-slate-500">param: {o.parameter}</span>}
                      </td>
                      <td className="max-w-xs px-4 py-2 align-top text-xs text-slate-700">
                        {o.evidence ? <span className="font-mono break-all">{o.evidence}</span> : missing}
                      </td>
                      <td className="px-4 py-2 text-right align-top">
                        <button type="button" onClick={() => void openRaw(o.id)} className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-teal-700 hover:text-teal-800">
                          <FileCode className="size-3.5" aria-hidden />
                          Original record
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rawError && <p role="alert" className="px-4 py-2 text-sm text-red-700">{rawError}</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <FindingWorkflow finding={finding} onSaved={setCurrent} />
          <StandardGuidanceCard guidance={finding.standard_guidance ?? []} />

          <Card title="Classification">
            <dl className="space-y-3">
              <Field label="CWE">{show(finding.cwe, unreadable('cwe'))}</Field>
              <Field label="OWASP">{show(finding.owasp)}</Field>
              <Field label="CVSS score">{show(finding.cvss_score)}</Field>
              <Field label="Category">{show(finding.category)}</Field>
              <Field label="Source">{finding.source_tool}</Field>
              <Field label="Template / plugin" mono>{show(finding.source_template, unreadable('source_template'))}</Field>
              {metadata.map(([key, value]) => (
                <Field key={key} label={key.replace(/_/g, ' ')}>
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </Field>
              ))}
              <Field label="Project">
                <Link to={projectPath(finding.project_id)} className="text-teal-700 hover:text-teal-800">
                  {finding.project_name}
                </Link>
              </Field>
              <Field label="First detected">{formatDateTime(finding.first_detected)}</Field>
              <Field label="Last detected">{formatDateTime(finding.last_detected)}</Field>
            </dl>
          </Card>

          <Card title="Status history">
            <ol className="space-y-4" aria-label="Status history">
              {finding.status_history.map((entry) => (
                <li key={entry.id} className="relative border-l-2 border-slate-200 pl-4">
                  <p className="text-sm text-slate-900">
                    {entry.old_status ? (
                      <>
                        {entry.old_status} → <strong className="font-semibold">{entry.new_status}</strong>
                      </>
                    ) : (
                      <strong className="font-semibold">{entry.new_status}</strong>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(entry.changed_at)} · {entry.changed_by?.name ?? 'System'}
                  </p>
                  {entry.comment && <p className="mt-1 text-sm whitespace-pre-wrap text-slate-600">{entry.comment}</p>}
                </li>
              ))}
            </ol>
          </Card>

          <PossibleDuplicates finding={finding} onSaved={setCurrent} />
        </div>
      </div>

      <Modal open={raw !== null} title="Original record" description={raw ? `From ${raw.original_filename}` : undefined} size="lg" onClose={() => setRaw(null)}>
        <pre className="max-h-[60vh] overflow-auto rounded-md bg-slate-900 p-3 font-mono text-xs whitespace-pre-wrap text-slate-100">
          {raw ? JSON.stringify(raw.raw_record, null, 2) : ''}
        </pre>
      </Modal>
    </>
  );
}
