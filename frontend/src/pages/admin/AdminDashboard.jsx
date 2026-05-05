import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios.js';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const CARD_STYLES = {
  brand: {
    bg: 'bg-gradient-to-br from-violet-500 to-brand-600',
    hover: 'hover:from-violet-600 hover:to-brand-700',
    icon: (
      <svg className="w-8 h-8 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  emerald: {
    bg: 'bg-gradient-to-br from-emerald-400 to-teal-600',
    hover: 'hover:from-emerald-500 hover:to-teal-700',
    icon: (
      <svg className="w-8 h-8 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  amber: {
    bg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    hover: 'hover:from-amber-500 hover:to-orange-600',
    icon: (
      <svg className="w-8 h-8 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
  },
  rose: {
    bg: 'bg-gradient-to-br from-rose-400 to-pink-600',
    hover: 'hover:from-rose-500 hover:to-pink-700',
    icon: (
      <svg className="w-8 h-8 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

function StatCard({ label, value, sub, color, to, arrow }) {
  const navigate = useNavigate();
  const style = CARD_STYLES[color];

  return (
    <button
      onClick={() => navigate(to)}
      className={`${style.bg} ${style.hover} text-white rounded-2xl p-5 sm:p-6 text-left w-full transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 group`}
    >
      <div className="flex items-start justify-between mb-3">
        {style.icon}
        <svg
          className="w-5 h-5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-sm font-medium opacity-90 mt-1">{label}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5 sm:p-6 animate-pulse bg-slate-100 h-36" />
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

    Promise.all([
      api.get('/users', { params: { limit: 1 } }),
      api.get('/visits', { params: { limit: 1, from, to } }),
      api.get('/sales', { params: { limit: 1, from, to } }),
    ]).then(([users, visits, sales]) => {
      setStats({
        totalUsers: users.data.meta.total,
        todayVisits: visits.data.meta.totalVisitsDeducted ?? 0,
        todaySales: sales.data.meta.total,
        todayRevenue: sales.data.meta.totalRevenue ?? 0,
      });
    }).catch(() => {});
  }, []);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Панель управления</h1>
        <p className="text-slate-500 mt-1 capitalize">
          {format(new Date(), 'EEEE, d MMMM yyyy', { locale: ru })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats ? (
          <>
            <StatCard
              label="Всего клиентов"
              value={stats.totalUsers}
              color="brand"
              to="/admin/users"
            />
            <StatCard
              label="Посещений сегодня"
              value={stats.todayVisits}
              sub="включая гостей"
              color="emerald"
              to="/admin/accounting"
            />
            <StatCard
              label="Продаж сегодня"
              value={stats.todaySales}
              color="amber"
              to="/admin/accounting"
            />
            <StatCard
              label="Выручка сегодня"
              value={`${stats.todayRevenue.toLocaleString()} ₸`}
              color="rose"
              to="/admin/accounting"
            />
          </>
        ) : (
          [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Клиенты', desc: 'Список клиентов, профили', to: '/admin/users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
          { label: 'Тарифы', desc: 'Управление тарифами', to: '/admin/tariffs', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
          { label: 'Бухгалтерия', desc: 'Продажи, посещения, экспорт', to: '/admin/accounting', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        ].map((link) => (
          <a
            key={link.to}
            href={link.to}
            onClick={(e) => { e.preventDefault(); window.location.href = link.to; }}
            className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center gap-4 hover:border-brand-200 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-100 transition-colors">
              <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={link.icon} />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 text-sm">{link.label}</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{link.desc}</p>
            </div>
            <svg className="w-4 h-4 text-slate-300 group-hover:text-brand-400 ml-auto flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}
