import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';
import { format, addDays } from 'date-fns';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import SellTariffModal from '../../components/admin/SellTariffModal.jsx';
import Input from '../../components/ui/Input.jsx';

function toLocalDateStr(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sellOpen, setSellOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ visitsBalance: '' });
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinVisits, setCheckinVisits] = useState(1);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [freezeForm, setFreezeForm] = useState({ from: '', to: '' });

  const fetchUser = async () => {
    try {
      const { data } = await api.get(`/users/${id}`);
      setUser(data);
      setAdjustForm({ visitsBalance: data.visitsBalance });
    } catch {
      toast.error('Пользователь не найден');
      navigate('/admin/users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUser(); }, [id]);

  const openFreezeModal = () => {
    const today = toLocalDateStr(new Date());
    const maxTo = user?.subscriptionEnd
      ? toLocalDateStr(new Date(Math.min(
          new Date(user.subscriptionEnd).getTime(),
          addDays(new Date(), 15).getTime()
        )))
      : toLocalDateStr(addDays(new Date(), 15));
    setFreezeForm({ from: today, to: maxTo });
    setFreezeOpen(true);
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    setAdjustLoading(true);
    try {
      await api.patch(`/users/${id}/adjust`, { visitsBalance: parseInt(adjustForm.visitsBalance) });
      toast.success('Данные обновлены');
      setAdjustOpen(false);
      fetchUser();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка обновления');
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleAdminCheckin = async (e) => {
    e.preventDefault();
    setCheckinLoading(true);
    try {
      await api.post('/visits/admin-checkin', { userId: parseInt(id), visitsDeducted: checkinVisits });
      toast.success(`Списано ${checkinVisits} посещ.`);
      setCheckinOpen(false);
      setCheckinVisits(1);
      fetchUser();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка списания');
    } finally {
      setCheckinLoading(false);
    }
  };

  const handleFreeze = async (e) => {
    e.preventDefault();
    setFreezeLoading(true);
    try {
      await api.post(`/users/${id}/freeze`, {
        freezeFrom: new Date(freezeForm.from).toISOString(),
        freezeTo: new Date(freezeForm.to).toISOString(),
      });
      const days = Math.ceil((new Date(freezeForm.to) - new Date(freezeForm.from)) / 86400000);
      toast.success(`Абонемент заморожен на ${days} дн.`);
      setFreezeOpen(false);
      fetchUser();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка заморозки');
    } finally {
      setFreezeLoading(false);
    }
  };

  const handleUnfreeze = async () => {
    if (!confirm('Разморозить абонемент досрочно?')) return;
    setFreezeLoading(true);
    try {
      await api.post(`/users/${id}/unfreeze`);
      toast.success('Абонемент разморожен');
      fetchUser();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка разморозки');
    } finally {
      setFreezeLoading(false);
    }
  };

  const hasSubscription = !!user?.subscriptionEnd;
  const isUnlimited = user?.isUnlimitedSubscription;
  const canAdjust = hasSubscription && !isUnlimited;
  const isFrozen = user?.frozenUntil && new Date(user.frozenUntil) > new Date();
  const canFreeze = hasSubscription && !user?.isSingleVisitTariff && new Date(user?.subscriptionEnd) > new Date();
  const canCheckin = hasSubscription && new Date(user?.subscriptionEnd) > new Date();
  const lastTariffVisits = user?.saleLogs?.[0]?.tariff?.visitsAmount ?? null;

  const freezeDaysSelected = freezeForm.from && freezeForm.to
    ? Math.ceil((new Date(freezeForm.to) - new Date(freezeForm.from)) / 86400000)
    : 0;

  const todayStr = toLocalDateStr(new Date());
  const maxFreezeToStr = user?.subscriptionEnd
    ? toLocalDateStr(new Date(Math.min(
        new Date(user.subscriptionEnd).getTime(),
        addDays(new Date(freezeForm.from || new Date()), 15).getTime()
      )))
    : toLocalDateStr(addDays(new Date(freezeForm.from || new Date()), 15));

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3" />
          <div className="h-48 bg-slate-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <button onClick={() => navigate('/admin/users')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Назад к списку
      </button>

      <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand-100 text-brand-700 text-xl font-bold flex items-center justify-center flex-shrink-0">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">{user.firstName} {user.lastName}</h1>
              <p className="text-slate-500">{user.phone}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {user.isVerified ? (
                  <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Верифицирован</span>
                ) : (
                  <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Не верифицирован</span>
                )}
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  С {format(new Date(user.createdAt), 'dd.MM.yyyy')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
            {canCheckin && (
              <Button variant="secondary" size="sm" onClick={() => setCheckinOpen(true)} className="flex-1 sm:flex-none">
                Списать посещение
              </Button>
            )}
            {canAdjust && (
              <Button variant="secondary" size="sm" onClick={() => setAdjustOpen(true)} className="flex-1 sm:flex-none">
                Корректировка
              </Button>
            )}
            {canFreeze && !isFrozen && (
              <Button variant="secondary" size="sm" onClick={openFreezeModal} loading={freezeLoading} className="flex-1 sm:flex-none">
                Заморозить
              </Button>
            )}
            {isFrozen && (
              <Button variant="secondary" size="sm" onClick={handleUnfreeze} loading={freezeLoading} className="flex-1 sm:flex-none">
                Разморозить
              </Button>
            )}
            <Button size="sm" onClick={() => setSellOpen(true)} className="flex-1 sm:flex-none">
              Продать абонемент
            </Button>
          </div>
        </div>

        {isFrozen && (
          <div className="mt-4 px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707" />
            </svg>
            Заморожен до {format(new Date(user.frozenUntil), 'dd.MM.yyyy')}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-bold text-brand-600">
              {isUnlimited ? '∞' : user.visitsBalance}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">Посещений</p>
          </div>
          <div className="text-center">
            <p className="text-base sm:text-lg font-semibold text-slate-800">
              {user.subscriptionEnd ? format(new Date(user.subscriptionEnd), 'dd.MM.yyyy') : '—'}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">Действует до</p>
          </div>
          <div className="text-center">
            <p className="text-base sm:text-lg font-semibold text-slate-800">
              {user.saleLogs?.length ?? 0}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">Покупок</p>
          </div>
        </div>
      </div>

      {/* Recent visits */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Последние посещения</h2>
        </div>
        {user.visitLogs?.length === 0 ? (
          <p className="p-6 text-center text-slate-400 text-sm">Нет записей</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {user.visitLogs?.map((v) => (
              <div key={v.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-slate-600">{format(new Date(v.createdAt), 'dd.MM.yyyy HH:mm')}</span>
                <span className="text-sm font-medium text-slate-800">−{v.visitsDeducted} посещений</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent sales */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">История покупок</h2>
        </div>
        {user.saleLogs?.length === 0 ? (
          <p className="p-6 text-center text-slate-400 text-sm">Нет записей</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {user.saleLogs?.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{s.tariff?.name}</p>
                  <p className="text-xs text-slate-400">{format(new Date(s.createdAt), 'dd.MM.yyyy HH:mm')}</p>
                </div>
                <span className="text-sm font-semibold text-emerald-600">{s.pricePaid.toLocaleString()} ₸</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <SellTariffModal isOpen={sellOpen} onClose={() => setSellOpen(false)} user={user} onSuccess={fetchUser} />

      {/* Freeze modal */}
      <Modal isOpen={freezeOpen} onClose={() => setFreezeOpen(false)} title="Заморозить абонемент">
        <form onSubmit={handleFreeze} className="space-y-4">
          <p className="text-sm text-slate-500">
            Выберите период заморозки (максимум 15 дней). Срок абонемента будет продлён автоматически.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">С даты</label>
              <input
                type="date"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                min={todayStr}
                max={user?.subscriptionEnd ? toLocalDateStr(new Date(user.subscriptionEnd)) : undefined}
                value={freezeForm.from}
                onChange={(e) => setFreezeForm((f) => ({ ...f, from: e.target.value, to: '' }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">По дату</label>
              <input
                type="date"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                min={freezeForm.from || todayStr}
                max={maxFreezeToStr}
                value={freezeForm.to}
                onChange={(e) => setFreezeForm((f) => ({ ...f, to: e.target.value }))}
                required
              />
            </div>
          </div>
          {freezeDaysSelected > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
              Заморозка на <strong>{freezeDaysSelected} дн.</strong> — абонемент продлится до{' '}
              <strong>
                {format(
                  new Date(new Date(user.subscriptionEnd).getTime() + freezeDaysSelected * 86400000),
                  'dd.MM.yyyy'
                )}
              </strong>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setFreezeOpen(false)} className="flex-1">Отмена</Button>
            <Button type="submit" loading={freezeLoading} className="flex-1" disabled={freezeDaysSelected <= 0}>
              Заморозить
            </Button>
          </div>
        </form>
      </Modal>

      {/* Admin check-in modal */}
      <Modal isOpen={checkinOpen} onClose={() => setCheckinOpen(false)} title="Списать посещение (Администратор)">
        <form onSubmit={handleAdminCheckin} className="space-y-4">
          <p className="text-sm text-slate-500">
            Ручное списание — для посетителей без телефона или без интернета.
          </p>
          <Input
            label="Количество посещений"
            type="number"
            min="1"
            max={isUnlimited ? undefined : (user?.visitsBalance ?? 1)}
            value={checkinVisits}
            onChange={(e) => setCheckinVisits(parseInt(e.target.value) || 1)}
          />
          {!isUnlimited && (
            <p className="text-xs text-slate-400">Баланс клиента: {user?.visitsBalance} посещ.</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCheckinOpen(false)} className="flex-1">Отмена</Button>
            <Button type="submit" loading={checkinLoading} className="flex-1">Списать</Button>
          </div>
        </form>
      </Modal>

      {/* Adjust balance modal */}
      <Modal isOpen={adjustOpen} onClose={() => setAdjustOpen(false)} title="Ручная корректировка">
        <form onSubmit={handleAdjust} className="space-y-4">
          <p className="text-sm text-slate-500">
            Корректировка баланса посещений.
            {lastTariffVisits && <span> Максимум по тарифу: <strong>{lastTariffVisits}</strong></span>}
          </p>
          <Input
            label="Баланс посещений"
            type="number"
            min="0"
            max={lastTariffVisits ?? undefined}
            value={adjustForm.visitsBalance}
            onChange={(e) => setAdjustForm({ visitsBalance: e.target.value })}
          />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setAdjustOpen(false)} className="flex-1">Отмена</Button>
            <Button type="submit" loading={adjustLoading} className="flex-1">Сохранить</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
