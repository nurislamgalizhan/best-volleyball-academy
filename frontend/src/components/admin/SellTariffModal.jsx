import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { isPast } from 'date-fns';
import api from '../../api/axios.js';
import { useTariffs } from '../../hooks/useTariffs.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';

const TIME_TYPE_LABEL = { ANY: 'Любое время', MORNING: 'Утро', EVENING: 'Вечер' };

export default function SellTariffModal({ isOpen, onClose, user, onSuccess }) {
  const { tariffs, loading: tariffsLoading, fetchTariffs } = useTariffs(true);
  const [selectedTariff, setSelectedTariff] = useState(null);
  const [pricePaid, setPricePaid] = useState('');
  const [step, setStep] = useState('select');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTariffs();
      setStep('select');
      setSelectedTariff(null);
      setPricePaid('');
    }
  }, [isOpen, fetchTariffs]);

  const handleSelectTariff = (tariff) => {
    setSelectedTariff(tariff);
    setPricePaid(String(tariff.price));
    setStep('confirm');
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await api.post('/sales', {
        userId: user.id,
        tariffId: selectedTariff.id,
        pricePaid: parseInt(pricePaid, 10) || 0,
      });
      toast.success('Абонемент продан успешно!');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка продажи');
    } finally {
      setLoading(false);
    }
  };

  const subscriptionActive = user?.subscriptionEnd && !isPast(new Date(user.subscriptionEnd));
  const hasActiveUnlimited = Boolean(user?.isUnlimitedSubscription && subscriptionActive);
  const blockReason = !user?.isVerified
    ? 'Клиент не прошел верификацию WhatsApp'
    : user?.visitsBalance > 0
      ? `У клиента есть ${user.visitsBalance} неиспользованных посещений`
      : hasActiveUnlimited
        ? 'У клиента действует безлимитный абонемент'
        : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Продать абонемент" size="lg">
      {step === 'select' && (
        <div>
          <p className="text-sm text-slate-500 mb-4">
            Клиент: <span className="font-medium text-slate-800">{user?.firstName} {user?.lastName}</span>
          </p>
          {blockReason && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <p className="text-sm text-red-700 font-medium">{blockReason}. Продажа невозможна.</p>
            </div>
          )}
          {tariffsLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, index) => <div key={index} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {tariffs.map((tariff) => (
                <button
                  key={tariff.id}
                  type="button"
                  onClick={() => !blockReason && handleSelectTariff(tariff)}
                  disabled={Boolean(blockReason)}
                  className="w-full text-left p-4 border border-slate-200 rounded-xl transition-all group disabled:opacity-40 disabled:cursor-not-allowed hover:border-brand-400 hover:bg-brand-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-800 group-hover:text-brand-700">{tariff.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {TIME_TYPE_LABEL[tariff.timeType]}
                        {tariff.timeStart && ` · ${tariff.timeStart}-${tariff.timeEnd}`}
                        {' · '}{tariff.durationDays} дней
                        {' · '}{tariff.visitsAmount ? `${tariff.visitsAmount} посещений` : 'Безлимит'}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-brand-600">{tariff.price.toLocaleString()} тг</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'confirm' && selectedTariff && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-amber-800 font-medium">
                Внимание! Эта операция необратима и будет навсегда записана в финансовый отчет. Подтверждаете?
              </p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Клиент</span><span className="font-medium">{user?.firstName} {user?.lastName}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Тариф</span><span className="font-medium">{selectedTariff.name}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Посещений</span><span className="font-medium">{selectedTariff.visitsAmount ?? 'Безлимит'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Срок</span><span className="font-medium">{selectedTariff.durationDays} дней</span></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Фактически оплачено (тг)</label>
            <input
              type="number"
              min="0"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={pricePaid}
              onChange={(e) => setPricePaid(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setStep('select')} className="flex-1">Назад</Button>
            <Button variant="success" loading={loading} onClick={handleConfirm} className="flex-1">Подтвердить продажу</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
