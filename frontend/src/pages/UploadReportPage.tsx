import { Upload } from 'lucide-react';
import UnavailableSection from '../components/states/UnavailableSection';

export default function UploadReportPage() {
  return (
    <UnavailableSection
      title="Upload Report"
      description="Upload OWASP ZAP, Nuclei and other VAPT reports to a project."
      icon={<Upload className="size-5" aria-hidden />}
      emptyTitle="Report upload is not available yet"
      emptyDescription="The upload and parsing pipeline is part of the next development phase. No reports can be processed in this version."
    />
  );
}
