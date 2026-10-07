import { ShieldCheck } from 'lucide-react';
import UnavailableSection from '../components/states/UnavailableSection';

export default function FindingsPage() {
  return (
    <UnavailableSection
      title="Findings"
      description="Vulnerabilities extracted from uploaded VAPT reports."
      icon={<ShieldCheck className="size-5" aria-hidden />}
      emptyTitle="Findings list not available yet"
      emptyDescription="Findings from uploaded reports are already stored and counted on the dashboard. The findings workspace (search, filters, status updates) is part of the next phase."
    />
  );
}
