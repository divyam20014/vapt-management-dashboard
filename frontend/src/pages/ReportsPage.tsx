import { FileText } from 'lucide-react';
import UnavailableSection from '../components/states/UnavailableSection';

export default function ReportsPage() {
  return (
    <UnavailableSection
      title="Reports"
      description="Uploaded reports and generated exports."
      icon={<FileText className="size-5" aria-hidden />}
      emptyTitle="No reports available"
      emptyDescription="Reports will be listed here once report upload and export are available."
    />
  );
}
