import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';
import Pagination from '../../components/ui/Pagination.jsx';

export default function VisitorHistoryPage() {
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/visits/my', { params: { page, limit: 15 } });
        setLogs(data.data);
        setMeta(data.meta);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Не удалось загрузить историю посещений');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [page]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">История посещений</h1>
        <p className="text-sm text-slate-500 mt-1">Здесь отображаются ваши отметки в зале и списанные посещения.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-50">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="p-4 animate-pulse">
                <div className="h-4 bg-slate-100 rounded w-1/2 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Посещений пока нет</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {logs.map((log) => (
              <div key={log.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-800">{format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm')}</p>
                  <p className="text-sm text-slate-500">
                    {log.section?.name || 'Секция'} · {log.guestCount > 0 ? `С гостями: ${log.guestCount}` : 'Без гостей'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">-{log.visitsDeducted}</p>
                  <p className="text-xs text-slate-400">посещ.</p>
                </div>
              </div>
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
