import { useEffect, useMemo, useState } from 'react';
import { useSections } from '../../hooks/useSections.js';
import { useTariffs } from '../../hooks/useTariffs.js';

const TIME_TYPE_LABEL = { ANY: 'Любое время', MORNING: 'День', EVENING: 'Вечер' };

export default function VisitorTariffsPage() {
  const { sections, fetchSections } = useSections(true);
  const { tariffs, loading, fetchTariffs } = useTariffs(true);
  const [sectionId, setSectionId] = useState('all');

  useEffect(() => {
    fetchSections();
    fetchTariffs();
  }, [fetchSections, fetchTariffs]);

  const grouped = useMemo(() => {
    const bySection = sections.map((section) => ({
      section,
      tariffs: tariffs.filter((tariff) => tariff.sectionId === section.id),
    })).filter((group) => group.tariffs.length > 0);

    return sectionId === 'all'
      ? bySection
      : bySection.filter((group) => group.section.id === Number(sectionId));
  }, [sections, tariffs, sectionId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Тарифы</h1>
        <p className="text-slate-500 text-sm mt-1">Выберите секцию и подходящий абонемент</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-sm font-medium text-slate-700 mb-3">Секции</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSectionId('all')} className={`px-3 py-2 rounded-xl border text-sm ${sectionId === 'all' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'border-slate-200 text-slate-600'}`}>Все</button>
          {sections.map((section) => (
            <button key={section.id} onClick={() => setSectionId(String(section.id))} className={`px-3 py-2 rounded-xl border text-sm ${sectionId === String(section.id) ? 'bg-brand-50 border-brand-500 text-brand-700' : 'border-slate-200 text-slate-600'}`}>
              {section.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
      ) : grouped.length === 0 ? (
        <div className="bg-slate-100 rounded-2xl p-5 text-sm text-slate-500 text-center">Тарифов пока нет</div>
      ) : grouped.map(({ section, tariffs: items }) => (
        <div key={section.id}>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{section.name}</h2>
          <div className="space-y-3">
            {items.map((t) => (
              <div key={t.id} className="rounded-2xl border border-slate-100 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-800">{t.name}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-brand-50 text-brand-700">
                        {t.visitsAmount ? `${t.visitsAmount} посещений` : '∞ Безлимит'}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600">{t.durationDays} дней</span>
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600">
                        {TIME_TYPE_LABEL[t.timeType]}{t.timeStart ? ` · ${t.timeStart}–${t.timeEnd}` : ''}
                      </span>
                    </div>
                  </div>
                  <p className="text-2xl font-black ml-4 text-brand-600">{t.price.toLocaleString()}<span className="text-sm font-normal"> ₸</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="bg-slate-100 rounded-2xl p-5 text-sm text-slate-500 text-center">
        Для приобретения абонемента обратитесь к администратору на стойке ресепшн
      </div>
    </div>
  );
}
