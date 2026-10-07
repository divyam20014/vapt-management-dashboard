import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import EmptyState from '../components/states/EmptyState';
import { buttonClasses } from '../components/ui/Button';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROUTES } from '../utils/routes';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <Card>
      <EmptyState
        title="Page not found"
        description="The page you requested does not exist."
        action={
          <Link to={ROUTES.dashboard} className={buttonClasses('secondary')}>
            Go to dashboard
          </Link>
        }
      />
    </Card>
  );
}
