import { NavLink } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { NAV_SECTIONS } from './navigation';
import { ROUTES } from '../../utils/routes';

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
        <div className="flex size-8 items-center justify-center rounded-md bg-teal-600 text-white">
          <ShieldCheck className="size-5" aria-hidden />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">VAPT Manager</p>
          <p className="text-[11px] text-slate-400">Security report management</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Main navigation">
        {NAV_SECTIONS.map((section, index) => (
          <div key={section.heading ?? index}>
            {section.heading && (
              <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{section.heading}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map(({ label, to, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === ROUTES.dashboard}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
