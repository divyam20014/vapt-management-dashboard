import type { ReactNode } from 'react';
import PageHeader from '../layout/PageHeader';
import Card from '../ui/Card';
import EmptyState from './EmptyState';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

interface UnavailableSectionProps {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: ReactNode;
}

/**
 * Honest empty state for sections whose data does not exist yet.
 * Shows no sample or placeholder records.
 */
export default function UnavailableSection({ title, description, emptyTitle, emptyDescription, icon }: UnavailableSectionProps) {
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
      </Card>
    </>
  );
}
