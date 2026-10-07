import { useSearchParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import UnavailableSection from '../components/states/UnavailableSection';

export default function CriticalHighPage() {
  const [searchParams] = useSearchParams();
  const severity = searchParams.get('severity');
  const label = severity === 'Critical' || severity === 'High' ? severity : 'Critical or High';

  return (
    <UnavailableSection
      title="Critical & High"
      description="Highest-risk findings across all projects."
      icon={<ShieldAlert className="size-5" aria-hidden />}
      emptyTitle={`${label} findings list not available yet`}
      emptyDescription="Critical and High totals are shown on the dashboard. The filtered findings list is part of the next phase."
    />
  );
}
