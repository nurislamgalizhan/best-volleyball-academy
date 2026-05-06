import { useState } from 'react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subYears } from 'date-fns';
import { ru } from 'date-fns/locale';

const presets = [
  { label: 'Сегодня', getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { label: 'Вчера', getValue: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
  { label: 'Эта неделя', getValue: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) }) },
  { label: 'Этот месяц', getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: 'Последний год', getValue: () => ({ from: startOfDay(subYears(new Date(), 1)), to: endOfDay(new Date()) }) },
];

export default function DateRangePicker({ from, to, onChange }) {
  const [open, setOpen] = useState(false);

  const label = from && to
    ? `${format(from, 'd MMM', { locale: ru })} — ${format(to, 'd MMM yyyy', { locale: ru })}`
    : from
    ? `От ${format(from, 'd MMM', { locale: ru })}`
    : 'Все время';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 transition-colors"
      >
        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {label}
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-4 w-[min(300px,calc(100vw-2rem))]">
            <div className="space-y-1 mb-4">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => { onChange(p.getValue()); setOpen(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div>
                <label className="text-xs text-slate-500 font-medium">От</label>
                <input
                  type="date"
                  className="mt-1 w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={from ? format(from, 'yyyy-MM-dd') : ''}
                  onChange={(e) => onChange({ from: e.target.value ? startOfDay(new Date(e.target.value)) : null, to })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">До</label>
                <input
                  type="date"
                  className="mt-1 w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={to ? format(to, 'yyyy-MM-dd') : ''}
                  onChange={(e) => onChange({ from, to: e.target.value ? endOfDay(new Date(e.target.value)) : null })}
                />
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-full mt-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 transition-colors"
              >
                Применить
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
