import { ShieldCheck } from 'lucide-react';
import UnavailableSection from '../components/states/UnavailableSection';

export default function FindingsPage() {
  return (
    <UnavailableSection
      title="Findings"
      description="Vulnerabilities extracted from uploaded VAPT reports."
      icon={<ShieldCheck className="size-5" aria-hidden />}
      emptyTitle="No findings available"
      emptyDescription="Findings are created only from uploaded VAPT reports. Report upload is not available yet."
    />
  );
}
