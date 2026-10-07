import { Link } from 'react-router-dom';
import { Menu, Plus, ShieldAlert, Upload } from 'lucide-react';
import { buttonClasses } from '../ui/Button';
import { NEW_PROJECT_PATH, ROUTES } from '../../utils/routes';

interface TopBarProps {
  onOpenMenu: () => void;
}

export default function TopBar({ onOpenMenu }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <div className="ml-auto flex items-center gap-2" aria-label="Quick actions">
        <div className="hidden items-center gap-2 md:flex">
          <Link to={`${ROUTES.criticalHigh}?severity=Critical`} className={buttonClasses('ghost', 'sm')}>
            <ShieldAlert className="size-4 text-red-600" aria-hidden />
            View Critical
          </Link>
          <Link to={`${ROUTES.criticalHigh}?severity=High`} className={buttonClasses('ghost', 'sm')}>
            <ShieldAlert className="size-4 text-orange-500" aria-hidden />
            View High
          </Link>
        </div>
        <Link to={ROUTES.upload} className={buttonClasses('secondary', 'sm')}>
          <Upload className="size-4" aria-hidden />
          <span className="hidden sm:inline">Upload VAPT Report</span>
          <span className="sm:hidden">Upload</span>
        </Link>
        <Link to={NEW_PROJECT_PATH} className={buttonClasses('primary', 'sm')}>
          <Plus className="size-4" aria-hidden />
          New Project
        </Link>
      </div>
    </header>
  );
}
