import { Link } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { useActingUser } from '../../hooks/useActingUser';
import { ROUTES } from '../../utils/routes';

/** "Acting as" selector. Identifies who records changes until authentication exists; it is not a login. */
export default function ActingUserSelect() {
  const { activeUsers, actingUser, setActingUser, loaded } = useActingUser();
  if (!loaded) return null;

  if (activeUsers.length === 0) {
    return (
      <Link to={ROUTES.settings} className="hidden items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 lg:inline-flex">
        <UserRound className="size-4" aria-hidden />
        Add a user to record changes
      </Link>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm text-slate-500">
      <UserRound className="size-4 shrink-0" aria-hidden />
      <span className="hidden xl:inline">Acting as</span>
      <select
        aria-label="Acting as"
        value={actingUser?.id ?? ''}
        onChange={(event) => setActingUser(event.target.value ? Number(event.target.value) : null)}
        className={`max-w-32 sm:max-w-40 rounded-md border-0 py-1.5 pr-8 pl-2 text-sm ring-1 ring-inset focus:ring-2 focus:ring-teal-600 focus:outline-none ${
          actingUser ? 'text-slate-900 ring-slate-300' : 'text-amber-800 ring-amber-400 bg-amber-50'
        }`}
      >
        <option value="">Choose user…</option>
        {activeUsers.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
    </label>
  );
}
