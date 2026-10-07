import { FileText } from 'lucide-react';
import UnavailableSection from '../components/states/UnavailableSection';

export default function ReportsPage() {
  return (
    <UnavailableSection
      title="Reports"
      description="Uploaded reports and generated exports."
      icon={<FileText className="size-5" aria-hidden />}
      emptyTitle="No reports available"
      emptyDescription="Generated exports and project reports are part of a later phase. Uploaded reports are listed as scans on each project page."
    />
  );
}
