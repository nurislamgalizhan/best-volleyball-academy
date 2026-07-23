import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import PhoneInput from '../../components/ui/PhoneInput.jsx';
import { formatPhoneDisplay, isCompletePhone, toApiPhone } from '../../utils/phone.js';

const EMPTY_ADMIN = { firstName: '', lastName: '', phone: '', password: '' };

export default function AdminsPage() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_ADMIN);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [searching, setSearching] = useState(false);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admins');
      setAdmins(data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Не удалось загрузить администраторов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  const createAdmin = async (event) => {
    event.preventDefault();
    if (!isCompletePhone(form.phone)) {
      toast.error('Введите номер в формате +7 XXX XXX XX XX');
      return;
    }
    setCreating(true);
    try {
      await api.post('/admins', { ...form, phone: toApiPhone(form.phone) });
      setForm(EMPTY_ADMIN);
      toast.success('Администратор создан');
      await loadAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Не удалось создать администратора');
    } finally {
      setCreating(false);
    }
  };

  const findCandidates = async (event) => {
    event.preventDefault();
    setSearching(true);
    try {
      const { data } = await api.get('/users', { params: { search, limit: 10 } });
      setCandidates(data.data.filter((user) => user.role === 'VISITOR'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Поиск не выполнен');
    } finally {
      setSearching(false);
    }
  };

  const promote = async (user) => {
    try {
      await api.post(`/admins/${user.id}/promote`);
      setCandidates((current) => current.filter((item) => item.id !== user.id));
      toast.success(`${user.firstName} назначен администратором`);
      await loadAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Не удалось назначить администратора');
    }
  };

  const demote = async (admin) => {
    if (!confirm(`Снять административные права у ${admin.firstName} ${admin.lastName}?`)) return;
    try {
      await api.post(`/admins/${admin.id}/demote`);
      toast.success('Административные права сняты');
      await loadAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Не удалось снять права');
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Администраторы</h1>
        <p className="text-sm text-slate-500 mt-1">Назначение сотрудников и управление их доступом.</p>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Текущие администраторы</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">Загрузка...</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {admins.map((admin) => (
              <div key={admin.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900">{admin.firstName} {admin.lastName}</p>
                  <p className="text-sm text-slate-500">{formatPhoneDisplay(admin.phone)}</p>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  {admin.role === 'SUPER_ADMIN' ? 'Главный администратор' : 'Администратор'}
                </span>
                {admin.role === 'ADMIN' && (
                  <Button size="sm" variant="danger" onClick={() => demote(admin)}>Снять права</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <form onSubmit={createAdmin} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">Новый администратор</h2>
            <p className="text-xs text-slate-500 mt-1">Создается отдельная подтвержденная учетная запись.</p>
          </div>
          <Input label="Имя" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} required />
          <Input label="Фамилия" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} required />
          <PhoneInput
            label="Телефон"
            value={form.phone}
            onChange={(phone) => setForm((current) => ({ ...current, phone }))}
            required
          />
          <Input label="Первоначальный пароль" type="password" minLength={8} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required />
          <Button type="submit" loading={creating}>Создать администратора</Button>
        </form>

        <section className="bg-white border border-slate-200 rounded-lg p-5">
          <div>
            <h2 className="font-semibold text-slate-900">Назначить существующего пользователя</h2>
            <p className="text-xs text-slate-500 mt-1">Назначить можно только пользователя без абонементов.</p>
          </div>
          <form onSubmit={findCandidates} className="flex gap-2 mt-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="flex-1 min-w-0 px-3 py-2.5 border border-slate-200 rounded-lg text-sm"
              placeholder="Имя или телефон"
              required
            />
            <Button type="submit" loading={searching}>Найти</Button>
          </form>
          <div className="divide-y divide-slate-100 mt-4">
            {candidates.map((candidate) => (
              <div key={candidate.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{candidate.firstName} {candidate.lastName}</p>
                  <p className="text-xs text-slate-500">{formatPhoneDisplay(candidate.phone)}</p>
                </div>
                <Button size="sm" onClick={() => promote(candidate)}>Назначить</Button>
              </div>
            ))}
            {!searching && search && candidates.length === 0 && (
              <p className="py-5 text-sm text-center text-slate-400">Подходящие пользователи не найдены</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
