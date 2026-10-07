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
      emptyTitle={`No ${label} findings available`}
      emptyDescription="Findings are created only from uploaded VAPT reports. Report upload is not available yet."
    />
  );
}
