import { useEffect } from 'react';

const APP_TITLE = 'VAPT Management Dashboard';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_TITLE}` : APP_TITLE;
  }, [title]);
}
