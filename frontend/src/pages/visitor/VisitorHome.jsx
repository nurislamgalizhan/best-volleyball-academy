import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { format, differenceInDays, isPast, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import api from '../../api/axios.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';

function toLocalDateStr(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function VisitorHome() {
  const { user, refreshUser } = useAuth();
  const [guestCount, setGuestCount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [freezeForm, setFreezeForm] = useState({ from: '', to: '' });

  const currentTariff = user?.currentTariff || null;
  const subscriptionActive = user?.subscriptionEnd && !isPast(new Date(user.subscriptionEnd));
  const isUnlimited = Boolean(user?.isUnlimitedSubscription || currentTariff?.visitsAmount === null);
  const isFrozen = Boolean(user?.frozenUntil && !isPast(new Date(user.frozenUntil)));
  const isSingleVisit = Boolean(user?.isSingleVisitTariff);
  const daysLeft = user?.subscriptionEnd
    ? Math.max(0, differenceInDays(new Date(user.subscriptionEnd), new Date()))
    : 0;

  const totalVisitsToDeduct = useMemo(() => 1 + guestCount, [guestCount]);
  const canCheckIn = !isFrozen && (isUnlimited ? Boolean(subscriptionActive) : Boolean(user?.visitsBalance > 0 && subscriptionActive));
  const canFreeze = Boolean(subscriptionActive && !isFrozen && !isSingleVisit);
  const maxGuests = Math.max(0, (user?.visitsBalance ?? 1) - 1);

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

  const handleFreeze = async (e) => {
    e.preventDefault();
    setFreezeLoading(true);
    try {
      await api.post(`/users/${user.id}/freeze`, {
        freezeFrom: new Date(freezeForm.from).toISOString(),
        freezeTo: new Date(freezeForm.to).toISOString(),
      });
      const days = Math.ceil((new Date(freezeForm.to) - new Date(freezeForm.from)) / 86400000);
      toast.success(`Абонемент заморожен на ${days} дн.`);
      setFreezeOpen(false);
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка заморозки');
    } finally {
      setFreezeLoading(false);
    }
  };

  const resetVisitFlow = () => {
    setConfirmOpen(false);
    setDuplicateWarning('');
    setGuestCount(0);
  };

  const submitCheckIn = async (confirmDuplicate = false) => {
    setLoading(true);
    try {
      const { data } = await api.post('/visits/checkin', {
        visitsDeducted: totalVisitsToDeduct,
        guestCount,
        confirmDuplicate,
      });
      toast.success(data.message);
      await refreshUser();
      resetVisitFlow();
    } catch (err) {
      if (err.response?.data?.code === 'DUPLICATE_CHECKIN_CONFIRMATION_REQUIRED') {
        setDuplicateWarning(err.response.data.message);
        setConfirmOpen(true);
        return;
      }
      toast.error(err.response?.data?.message || 'Ошибка списания');
    } finally {
      setLoading(false);
    }
  };

  const todayStr = toLocalDateStr(new Date());
  const maxFreezeToStr = user?.subscriptionEnd
    ? toLocalDateStr(new Date(Math.min(
        new Date(user.subscriptionEnd).getTime(),
        addDays(new Date(freezeForm.from || new Date()), 15).getTime()
      )))
    : toLocalDateStr(addDays(new Date(freezeForm.from || new Date()), 15));

  const freezeDaysSelected = freezeForm.from && freezeForm.to
    ? Math.ceil((new Date(freezeForm.to) - new Date(freezeForm.from)) / 86400000)
    : 0;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-3xl p-8 text-white text-center shadow-lg">
        <p className="text-brand-200 text-sm font-medium mb-2">Ваш баланс</p>
        {isUnlimited ? (
          <p className="text-6xl font-black">∞</p>
        ) : (
          <p className="text-6xl font-black">{user?.visitsBalance ?? 0}</p>
        )}
        <p className="text-brand-200 mt-2 text-sm">
          {isUnlimited ? 'Безлимитный абонемент' : 'посещений'}
        </p>

        {user?.subscriptionEnd && (
          <div className="mt-5 pt-5 border-t border-brand-500">
            {isFrozen ? (
              <>
                <p className="text-blue-200 text-xs font-medium">Абонемент заморожен</p>
                <p className="text-white font-semibold mt-0.5">
                  до {format(new Date(user.frozenUntil), 'd MMMM yyyy', { locale: ru })}
                </p>
                <p className="text-brand-300 text-xs mt-0.5">
                  Действует до {format(new Date(user.subscriptionEnd), 'd MMMM yyyy', { locale: ru })}
                </p>
              </>
            ) : subscriptionActive ? (
              <>
                <p className="text-brand-200 text-xs">Действует до</p>
                <p className="text-white font-semibold mt-0.5">
                  {format(new Date(user.subscriptionEnd), 'd MMMM yyyy', { locale: ru })}
                </p>
                <p className="text-brand-300 text-xs mt-0.5">Осталось {daysLeft} дн.</p>
              </>
            ) : (
              <p className="text-red-300 text-sm font-medium">Абонемент истек</p>
            )}
          </div>
        )}

        {!user?.subscriptionEnd && user?.visitsBalance === 0 && (
          <p className="text-brand-300 text-sm mt-4">Нет активного абонемента</p>
        )}
      </div>

      {currentTariff && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">{currentTariff.name}</h2>
              <p className="text-sm text-slate-500 mt-1">Ваш текущий тариф</p>
            </div>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              {currentTariff.visitsAmount === null ? 'Безлимит' : `${currentTariff.visitsAmount} посещ.`}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">Окно посещения</p>
              <p className="font-medium text-slate-900 mt-1">{currentTariff.accessLabel || 'Любое время'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">Срок действия</p>
              <p className="font-medium text-slate-900 mt-1">{currentTariff.durationDays} дн.</p>
            </div>
          </div>
        </div>
      )}

      {canCheckIn && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-slate-800 mb-1">Отметить посещение</h2>
            <p className="text-sm text-slate-500">
              {isUnlimited
                ? 'Для безлимитного тарифа можно отметить только собственное посещение.'
                : 'Вы можете отметить себя и при необходимости добавить гостей.'}
            </p>
          </div>

          {!isUnlimited && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">Гости</p>
                  <p className="text-sm text-slate-500">С каждого гостя спишется отдельное посещение.</p>
                </div>
                <Button
                  variant={guestCount > 0 ? 'secondary' : 'success'}
                  size="sm"
                  onClick={() => setGuestCount((count) => (count > 0 ? 0 : Math.min(1, maxGuests)))}
                >
                  {guestCount > 0 ? 'Убрать гостей' : 'Добавить гостя'}
                </Button>
              </div>

              {guestCount > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Количество гостей</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setGuestCount((count) => Math.max(0, count - 1))}
                      className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white transition-colors font-medium"
                    >
                      −
                    </button>
                    <span className="text-xl font-bold text-slate-900 w-8 text-center">{guestCount}</span>
                    <button
                      type="button"
                      onClick={() => setGuestCount((count) => Math.min(maxGuests, count + 1))}
                      className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white transition-colors font-medium"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Всего спишется</span>
                <span className="font-semibold text-slate-800">{totalVisitsToDeduct}</span>
              </div>
            </div>
          )}

          <Button className="w-full" size="lg" onClick={() => setConfirmOpen(true)}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Отметиться
          </Button>
        </div>
      )}

      {isFrozen && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-center">
          <p className="text-blue-800 font-medium">Абонемент заморожен</p>
          <p className="text-blue-600 text-sm mt-1">
            Заморозка действует до {format(new Date(user.frozenUntil), 'd MMMM yyyy', { locale: ru })}
          </p>
        </div>
      )}

      {!canCheckIn && !isFrozen && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-center">
          <p className="text-amber-800 font-medium">
            {!subscriptionActive && user?.subscriptionEnd ? 'Абонемент истек' : 'Нет доступных посещений'}
          </p>
          <p className="text-amber-600 text-sm mt-1">Приобретите абонемент в разделе «Тарифы»</p>
        </div>
      )}

      {canFreeze && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-slate-800">Заморозка абонемента</p>
              <p className="text-sm text-slate-500 mt-0.5">До 15 дней. Срок действия продлится автоматически.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={openFreezeModal} className="flex-shrink-0">
              Заморозить
            </Button>
          </div>
        </div>
      )}

      {/* Freeze modal */}
      <Modal isOpen={freezeOpen} onClose={() => setFreezeOpen(false)} title="Заморозить абонемент">
        <form onSubmit={handleFreeze} className="space-y-4">
          <p className="text-sm text-slate-500">
            Выберите период заморозки (максимум 15 дней). Срок абонемента продлится автоматически.
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
          {freezeDaysSelected > 0 && user?.subscriptionEnd && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
              Заморозка на <strong>{freezeDaysSelected} дн.</strong> — абонемент продлится до{' '}
              <strong>
                {format(
                  new Date(new Date(user.subscriptionEnd).getTime() + freezeDaysSelected * 86400000),
                  'd MMMM yyyy',
                  { locale: ru }
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

      {/* Check-in confirmation modal */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => !loading && resetVisitFlow()}
        title={duplicateWarning ? 'Повторное списание' : 'Подтверждение'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-slate-600 text-center">
            {duplicateWarning
              ? duplicateWarning
              : isUnlimited
                ? 'Подтвердите посещение'
                : (
                    <>
                      Подтвердите списание{' '}
                      <span className="font-bold text-slate-900 text-lg">{totalVisitsToDeduct}</span>{' '}
                      посещ.
                    </>
                  )}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={resetVisitFlow} disabled={loading}>
              Нет
            </Button>
            <Button className="flex-1" loading={loading} onClick={() => submitCheckIn(Boolean(duplicateWarning))}>
              Да, списать
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
