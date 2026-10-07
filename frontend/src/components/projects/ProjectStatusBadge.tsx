import { PROJECT_STATUS_STYLES, type ProjectStatus } from '../../utils/constants';

export default function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PROJECT_STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}
