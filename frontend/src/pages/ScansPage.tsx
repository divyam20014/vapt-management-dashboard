import { ScanLine } from 'lucide-react';
import UnavailableSection from '../components/states/UnavailableSection';

export default function ScansPage() {
  return (
    <UnavailableSection
      title="Scans"
      description="History of uploaded VAPT reports, newest first."
      icon={<ScanLine className="size-5" aria-hidden />}
      emptyTitle="No scans available"
      emptyDescription="Every successfully processed report creates a scan record. Report upload is not available yet."
    />
  );
}
