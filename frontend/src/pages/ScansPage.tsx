import { ScanLine } from 'lucide-react';
import UnavailableSection from '../components/states/UnavailableSection';

export default function ScansPage() {
  return (
    <UnavailableSection
      title="Scans"
      description="History of uploaded VAPT reports, newest first."
      icon={<ScanLine className="size-5" aria-hidden />}
      emptyTitle="Scan history view not available yet"
      emptyDescription="The cross-project scan history view is part of a later phase. Recent scans are shown on the dashboard and on each project page."
    />
  );
}
