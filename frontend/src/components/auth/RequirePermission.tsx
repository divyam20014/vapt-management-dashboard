import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import Card from '../ui/Card';
import EmptyState from '../states/EmptyState';
import { useAuth } from '../../hooks/useAuth';
import type { Permission } from '../../utils/constants';

/** Shows the page only to roles that may use it. Hiding is for clarity; the API refuses the actions anyway. */
export default function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can, user } = useAuth();
  if (can(permission)) return <>{children}</>;
  return (
    <Card>
      <EmptyState
        icon={<Lock className="size-5" aria-hidden />}
        title="You don't have access to this page"
        description={`Your role (${user?.role ?? 'unknown'}) does not allow this. Ask an Admin if you need access.`}
      />
    </Card>
  );
}
