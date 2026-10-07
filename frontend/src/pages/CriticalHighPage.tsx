import PageHeader from '../components/layout/PageHeader';
import FindingsWorkspace from '../components/findings/FindingsWorkspace';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { CRITICAL_HIGH } from '../utils/constants';

export default function CriticalHighPage() {
  useDocumentTitle('Critical & High');
  return (
    <>
      <PageHeader title="Critical & High" description="The highest-risk findings across all projects." />
      <FindingsWorkspace lockedSeverities={CRITICAL_HIGH} emptyTitle="No Critical or High findings" />
    </>
  );
}
