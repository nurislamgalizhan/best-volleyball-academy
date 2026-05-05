import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useUsers } from '../../hooks/useUsers.js';
import Pagination from '../../components/ui/Pagination.jsx';
import Button from '../../components/ui/Button.jsx';
import { format } from 'date-fns';

export default function UsersPage() {
  const { users, meta, loading, fetchUsers } = useUsers();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => fetchUsers({ page, search }), [page, search, fetchUsers]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when search changes
  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Клиенты</h1>
          <p className="text-slate-500 text-sm mt-1">Всего: {meta.total}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Поиск по имени, фамилии, телефону..."
              value={search}
              onChange={handleSearch}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="divide-y divide-slate-50">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="p-4 animate-pulse flex gap-4">
                <div className="w-10 h-10 bg-slate-100 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-100 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-400">Клиенты не найдены</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {users.map((u) => (
              <Link
                key={u.id}
                to={`/admin/users/${u.id}`}
                className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center flex-shrink-0">
                  {u.firstName[0]}{u.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">{u.firstName} {u.lastName}</p>
                  <p className="text-sm text-slate-400">{u.phone}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-slate-800">
                    {u.visitsBalance} посещений
                  </p>
                  {u.subscriptionEnd && (
                    <p className="text-xs text-slate-400">
                      до {format(new Date(u.subscriptionEnd), 'dd.MM.yyyy')}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 hidden xs:flex sm:flex">
                  {u.isVerified ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      <span className="hidden sm:inline">Верифицирован</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                      <span className="hidden sm:inline">Не верифицирован</span>
                    </span>
                  )}
                </div>
                <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}

        <div className="p-4 border-t border-slate-100">
          <Pagination page={page} pages={meta.pages} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}
