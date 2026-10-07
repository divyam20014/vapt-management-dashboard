import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import { buttonClasses } from '../components/ui/Button';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import { remediationService } from '../services/remediationService';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROUTES, guidelineFindingsPath } from '../utils/routes';
import { formatNumber } from '../utils/format';

const back = (
  <Link to={ROUTES.remediation} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
    <ArrowLeft className="size-4" aria-hidden />
    Remediation Library
  </Link>
);

export default function RemediationGuidelinePage() {
  const { slug = '' } = useParams();
  const { data, error, reload } = useApiQuery(() => remediationService.get(slug), [slug]);
  useDocumentTitle(data?.title ?? 'Remediation guidance');

  if (error) {
    return (
      <>
        <PageHeader breadcrumb={back} title="Guideline not found" />
        <Card>
          <ErrorState title={error.status === 404 ? 'Guideline not found' : 'The guideline could not be loaded'} message={error.message} onRetry={error.status === 404 ? undefined : reload} />
        </Card>
      </>
    );
  }
  if (!data) return <LoadingState label="Loading guideline…" />;

  const rules = [
    ...data.zap_rules.map((id) => `OWASP ZAP alert ${id}`),
    ...data.nuclei_rules.map((rule) => `Nuclei ${rule.includes(':') ? `template ${rule.split(':')[0]} (${rule.split(':')[1]})` : `template ${rule}`}`),
    ...data.cwe_ids,
  ];

  return (
    <>
      <PageHeader
        breadcrumb={back}
        title={data.title}
        description={[data.category, data.owasp].filter(Boolean).join(' · ')}
        actions={
          data.findings > 0 && (
            <Link to={guidelineFindingsPath(data.slug)} className={buttonClasses('primary')}>
              View {formatNumber(data.findings)} linked finding{data.findings === 1 ? '' : 's'}
            </Link>
          )
        }
      />
      <p className="mb-6 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
        Standard guidance from the application's library. It does not replace the recommendation in a scanner report, and it
        should be adapted to the affected application.
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Summary">
            <p className="text-sm text-slate-700">{data.summary}</p>
          </Card>
          <Card title="Recommended steps">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              {data.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Card>
          {data.verification && (
            <Card title="How to verify the fix">
              <p className="text-sm text-slate-700">{data.verification}</p>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Applied automatically to" description="Findings are linked only by these exact rules, never by title similarity.">
            {rules.length ? (
              <ul className="space-y-1 font-mono text-xs text-slate-700">
                {rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No automatic rules. Use this guideline as reference.</p>
            )}
            <p className="mt-3 text-sm text-slate-600">
              {formatNumber(data.active_findings)} active of {formatNumber(data.findings)} linked finding{data.findings === 1 ? '' : 's'}.
            </p>
          </Card>
          <Card title="References">
            <ul className="space-y-2 text-sm">
              {data.references.map((ref) => (
                <li key={ref.url}>
                  <a href={ref.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-teal-700 hover:text-teal-800">
                    <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {ref.title}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
