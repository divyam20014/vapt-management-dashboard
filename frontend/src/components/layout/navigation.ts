import {
  BookOpen,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  ScanLine,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '../../utils/routes';
import { PERMISSIONS, type Permission } from '../../utils/constants';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Shown only to roles with this permission. */
  permission?: Permission;
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
      { label: 'Remediation Library', to: ROUTES.remediation, icon: BookOpen },
    ],
  },
  {
    heading: 'Reporting',
    items: [
      { label: 'Reports', to: ROUTES.reports, icon: FileText },
      { label: 'Upload Report', to: ROUTES.upload, icon: Upload, permission: PERMISSIONS.reportsUpload },
    ],
  },
  {
    heading: 'System',
    items: [
      { label: 'Audit Log', to: ROUTES.audit, icon: History, permission: PERMISSIONS.auditRead },
      { label: 'Settings', to: ROUTES.settings, icon: Settings },
    ],
  },
];
