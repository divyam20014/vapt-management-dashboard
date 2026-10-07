import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import { settingsService } from '../services/settingsService';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const { data, loading, error, reload } = useApiQuery(() => settingsService.get(), []);

  return (
    <>
      <PageHeader title="Settings" description="Current server configuration (read-only; set through environment variables)." />
      <Card title="Application configuration" bodyClassName="">
        {error ? (
          <ErrorState title="Settings could not be loaded" message={error.message} onRetry={reload} />
        ) : loading || !data ? (
          <LoadingState label="Loading settings…" />
        ) : (
          <dl className="divide-y divide-slate-100">
            {[
              ['Application', data.app_name],
              ['Version', data.version],
              ['Database engine', data.database_engine],
              ['Database file', data.database_location],
              ['Uploaded report storage', data.upload_location],
              ['Export storage', data.export_location],
              ['Maximum upload size', `${data.max_upload_size_mb} MB`],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-slate-500">{label}</dt>
                <dd className="font-mono text-sm text-slate-900 sm:col-span-2">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </>
  );
}
