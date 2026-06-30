import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import { formatPhoneDisplay } from '../utils/phone.js';

export default function AdminMfaPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const phone = location.state?.phone || '';
  const initialCooldown = location.state?.resendCooldown ?? 60;

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(initialCooldown);

  useEffect(() => {
    if (!phone) {
      toast.error('Сессия истекла. Войдите снова.');
      navigate('/login', { replace: true });
    }
  }, [phone, navigate]);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      toast.error('Введите 6-значный код');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/admin-mfa/verify', { phone, code });
      login(data.token, data.user);
      toast.success(`Добро пожаловать, ${data.user.firstName}!`);
      navigate('/admin', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Неверный код подтверждения');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await api.post('/auth/admin-mfa/resend', { phone });
      toast.success('Новый код отправлен в WhatsApp');
      setTimer(60);
    } catch (err) {
      const msg = err.response?.data?.message || 'Ошибка отправки';
      const seconds = Number(msg.match(/(\d+)/)?.[1] || 0);
      if (err.response?.status === 429 && seconds > 0) setTimer(seconds);
      toast.error(msg);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-900 rounded-2xl mb-4 shadow-lg">
            <span className="text-white font-black text-lg">BVA</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Двухфакторная аутентификация</h1>
          <p className="text-slate-500 mt-2">Введите код из WhatsApp для входа в панель администратора</p>
          {phone && <p className="text-brand-700 font-medium mt-1">{formatPhoneDisplay(phone)}</p>}
        </div>

        <form onSubmit={handleVerify} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Код подтверждения</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
            />
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Подтвердить
          </Button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending || timer > 0}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:text-slate-400 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          >
            {resending
              ? 'Отправка...'
              : timer > 0
                ? `Отправить код повторно через ${timer} сек.`
                : 'Отправить код повторно'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Вернуться к входу
          </button>
        </form>
      </div>
    </div>
  );
}
