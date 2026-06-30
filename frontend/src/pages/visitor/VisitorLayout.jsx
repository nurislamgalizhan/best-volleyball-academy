import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

const navItems = [
  {
    to: '/visitor',
    end: true,
    label: 'Главная',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    to: '/visitor/history',
    label: 'История',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    to: '/visitor/tariffs',
    label: 'Тарифы',
    icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  },
];

export default function VisitorLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-900 text-white rounded-lg flex items-center justify-center font-black text-[10px]">
              BVA
            </div>
            <span className="font-semibold text-slate-800 text-sm">Best Volleyball Academy</span>
          </div>
          <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
            Выйти
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <Outlet />
      </main>

      <nav className="bg-white border-t border-slate-100 sticky bottom-0">
        <div className="max-w-lg mx-auto flex">
          {navItems.map(({ to, end, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                  isActive ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'
                }`
              }
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
              </svg>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
