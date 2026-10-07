import {
  FileText,
  FolderKanban,
  LayoutDashboard,
  ScanLine,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '../../utils/routes';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const NAV_SECTIONS: { heading?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'Dashboard', to: ROUTES.dashboard, icon: LayoutDashboard },
      { label: 'Projects', to: ROUTES.projects, icon: FolderKanban },
    ],
  },
  {
    heading: 'Vulnerabilities',
    items: [
      { label: 'Findings', to: ROUTES.findings, icon: ShieldCheck },
      { label: 'Critical & High', to: ROUTES.criticalHigh, icon: ShieldAlert },
      { label: 'Scans', to: ROUTES.scans, icon: ScanLine },
    ],
  },
  {
    heading: 'Reporting',
    items: [
      { label: 'Reports', to: ROUTES.reports, icon: FileText },
      { label: 'Upload Report', to: ROUTES.upload, icon: Upload },
    ],
  },
  {
    heading: 'System',
    items: [{ label: 'Settings', to: ROUTES.settings, icon: Settings }],
  },
];
