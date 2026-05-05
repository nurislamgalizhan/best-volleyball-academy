import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTariffs } from '../../hooks/useTariffs.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';

const TIME_TYPE_LABEL = { ANY: 'Любое время', MORNING: 'Утро', EVENING: 'Вечер' };
const TIME_TYPE_COLORS = {
  ANY: 'bg-blue-50 text-blue-700 border-blue-100',
  MORNING: 'bg-amber-50 text-amber-700 border-amber-100',
  EVENING: 'bg-indigo-50 text-indigo-700 border-indigo-100',
};

const EMPTY_FORM = { name: '', visitsAmount: '', durationDays: '', price: '', timeType: 'ANY', timeStart: '', timeEnd: '' };

export default function TariffsAdminPage() {
  const { tariffs, loading, fetchTariffs, createTariff, updateTariff, deactivateTariff, activateTariff } = useTariffs();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('active');

  useEffect(() => { fetchTariffs(); }, [fetchTariffs]);

  const activeTariffs = tariffs.filter((t) => t.isActive);
  const archivedTariffs = tariffs.filter((t) => !t.isActive);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setModalOpen(true); };
  const openEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name,
      visitsAmount: t.visitsAmount ?? '',
      durationDays: t.durationDays,
      price: t.price,
      timeType: t.timeType,
      timeStart: t.timeStart ?? '',
      timeEnd: t.timeEnd ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        visitsAmount: form.visitsAmount === '' || form.visitsAmount === null ? null : parseInt(form.visitsAmount),
        durationDays: parseInt(form.durationDays),
        price: parseInt(form.price),
        timeType: form.timeType,
        timeStart: form.timeStart || null,
        timeEnd: form.timeEnd || null,
      };
      if (editing) {
        await updateTariff(editing.id, payload);
        toast.success('Тариф обновлен');
      } else {
        await createTariff(payload);
        toast.success('Тариф создан');
      }
      setModalOpen(false);
      fetchTariffs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (t) => {
    if (!confirm(`Деактивировать тариф "${t.name}"?`)) return;
    try {
      await deactivateTariff(t.id);
      toast.success('Тариф деактивирован');
      fetchTariffs();
    } catch {
      toast.error('Ошибка деактивации');
    }
  };

  const handleActivate = async (t) => {
    if (!confirm(`Восстановить тариф "${t.name}"?`)) return;
    try {
      await activateTariff(t.id);
      toast.success('Тариф восстановлен');
      fetchTariffs();
    } catch {
      toast.error('Ошибка восстановления');
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const renderTariffCard = (t) => (
    <div key={t.id} className="rounded-2xl border p-5 bg-white border-slate-100">
      <div className="flex items-start justify-between mb-3">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${TIME_TYPE_COLORS[t.timeType]}`}>
          {TIME_TYPE_LABEL[t.timeType]}
          {t.timeStart && ` · ${t.timeStart}–${t.timeEnd}`}
        </span>
      </div>
      <h3 className="font-semibold text-slate-800 mb-1">{t.name}</h3>
      <p className="text-sm text-slate-500 mb-3">
        {t.visitsAmount ? `${t.visitsAmount} посещений` : 'Безлимит'} · {t.durationDays} дней
      </p>
      <div className="flex items-center justify-between">
        <p className="text-xl font-bold text-brand-600">{t.price.toLocaleString()} ₸</p>
        <div className="flex gap-2">
          <button onClick={() => openEdit(t)} className="text-xs text-slate-500 hover:text-brand-600 transition-colors">Изменить</button>
          {t.isActive ? (
            <button onClick={() => handleDeactivate(t)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Деактивировать</button>
          ) : (
            <button onClick={() => handleActivate(t)} className="text-xs text-emerald-500 hover:text-emerald-700 transition-colors">Восстановить</button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Тарифы</h1>
        <Button onClick={openCreate}>+ Новый тариф</Button>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-6">
        {[{ id: 'active', label: 'Активные' }, { id: 'archived', label: `Архивные${archivedTariffs.length ? ` (${archivedTariffs.length})` : ''}` }].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === item.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />)
        ) : tab === 'active' ? (
          activeTariffs.length === 0 ? (
            <p className="text-slate-400 col-span-3 text-center py-10">Нет активных тарифов</p>
          ) : (
            activeTariffs.map(renderTariffCard)
          )
        ) : (
          archivedTariffs.length === 0 ? (
            <p className="text-slate-400 col-span-3 text-center py-10">Нет архивных тарифов</p>
          ) : (
            archivedTariffs.map(renderTariffCard)
          )
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Редактировать тариф' : 'Новый тариф'}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Название" placeholder="Утренний — 8 посещений" value={form.name} onChange={set('name')} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Посещений (пусто = безлимит)" type="number" min="1" placeholder="8" value={form.visitsAmount} onChange={set('visitsAmount')} />
            <Input label="Срок действия (дней)" type="number" min="1" value={form.durationDays} onChange={set('durationDays')} required />
          </div>
          <Input label="Цена (₸)" type="number" min="0" value={form.price} onChange={set('price')} required />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Тип времени</label>
            <select
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.timeType}
              onChange={set('timeType')}
            >
              <option value="ANY">Любое время</option>
              <option value="MORNING">Утреннее</option>
              <option value="EVENING">Вечернее</option>
            </select>
          </div>
          {form.timeType !== 'ANY' && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Начало (HH:MM)" type="time" value={form.timeStart} onChange={set('timeStart')} />
              <Input label="Конец (HH:MM)" type="time" value={form.timeEnd} onChange={set('timeEnd')} />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)} className="flex-1">Отмена</Button>
            <Button type="submit" loading={saving} className="flex-1">Сохранить</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
