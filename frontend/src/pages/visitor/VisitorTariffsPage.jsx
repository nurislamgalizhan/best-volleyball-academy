import { useEffect } from 'react';
import { useTariffs } from '../../hooks/useTariffs.js';

const TIME_TYPE_LABEL = { ANY: 'Любое время', MORNING: 'Утреннее', EVENING: 'Вечернее' };
const TIME_TYPE_COLORS = {
  ANY: { bg: 'bg-blue-50', border: 'border-blue-100', badge: 'bg-blue-100 text-blue-700', accent: 'text-blue-600' },
  MORNING: { bg: 'bg-amber-50', border: 'border-amber-100', badge: 'bg-amber-100 text-amber-700', accent: 'text-amber-600' },
  EVENING: { bg: 'bg-indigo-50', border: 'border-indigo-100', badge: 'bg-indigo-100 text-indigo-700', accent: 'text-indigo-600' },
};

const GROUP_ORDER = ['MORNING', 'EVENING', 'ANY'];
const GROUP_TITLES = { MORNING: 'Утреннее время', EVENING: 'Вечернее время', ANY: 'Любое время' };

export default function VisitorTariffsPage() {
  const { tariffs, loading, fetchTariffs } = useTariffs(true);

  useEffect(() => { fetchTariffs(); }, [fetchTariffs]);

  const grouped = GROUP_ORDER.reduce((acc, type) => {
    const group = tariffs.filter((t) => t.timeType === type);
    if (group.length > 0) acc[type] = group;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Тарифы</h1>
        <p className="text-slate-500 text-sm mt-1">Выберите подходящий абонемент</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        Object.entries(grouped).map(([type, items]) => {
          const colors = TIME_TYPE_COLORS[type];
          return (
            <div key={type}>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                {GROUP_TITLES[type]}
              </h2>
              <div className="space-y-3">
                {items.map((t) => (
                  <div
                    key={t.id}
                    className={`rounded-2xl border p-5 ${colors.bg} ${colors.border}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800">{t.name}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${colors.badge}`}>
                            {t.visitsAmount ? `${t.visitsAmount} посещений` : '∞ Безлимит'}
                          </span>
                          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-white/60 text-slate-600">
                            {t.durationDays} дней
                          </span>
                          {t.timeStart && (
                            <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-white/60 text-slate-600">
                              {t.timeStart}–{t.timeEnd}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className={`text-2xl font-black ml-4 ${colors.accent}`}>
                        {t.price.toLocaleString()}<span className="text-sm font-normal"> ₸</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      <div className="bg-slate-100 rounded-2xl p-5 text-sm text-slate-500 text-center">
        Для приобретения абонемента обратитесь к администратору на стойке ресепшн
      </div>
    </div>
  );
}
