import PageHeader from '../components/layout/PageHeader';
import FindingsWorkspace from '../components/findings/FindingsWorkspace';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function FindingsPage() {
  useDocumentTitle('Findings');
  return (
    <>
      <PageHeader
        title="Findings"
        description="Vulnerabilities extracted from uploaded VAPT reports. Filter, review evidence and track remediation."
      />
      <FindingsWorkspace />
    </>
  );
}
