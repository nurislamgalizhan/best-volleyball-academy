import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import PhoneInput from '../../components/ui/PhoneInput.jsx';
import { formatPhoneDisplay, isCompletePhone, toApiPhone } from '../../utils/phone.js';

const EMPTY_ADMIN = {
  firstName: '',
  lastName: '',
  phone: '',
  password: '',
  confirmPassword: '',
};
const EMPTY_PASSWORD = { password: '', confirmPassword: '' };

export default function AdminsPage() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_ADMIN);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [searching, setSearching] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState(null);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD);
  const [showDialogPassword, setShowDialogPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

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
    if (form.password !== form.confirmPassword) {
      toast.error('Пароли не совпадают');
      return;
    }
    setCreating(true);
    try {
      await api.post('/admins', {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: toApiPhone(form.phone),
        password: form.password,
      });
      setForm(EMPTY_ADMIN);
      setShowCreatePassword(false);
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

  const openPasswordDialog = (mode, user) => {
    setPasswordForm(EMPTY_PASSWORD);
    setShowDialogPassword(false);
    setPasswordDialog({ mode, user });
  };

  const closePasswordDialog = () => {
    if (savingPassword) return;
    setPasswordDialog(null);
    setPasswordForm(EMPTY_PASSWORD);
    setShowDialogPassword(false);
  };

  const saveAdminPassword = async (event) => {
    event.preventDefault();
    if (!passwordDialog) return;
    if (passwordForm.password !== passwordForm.confirmPassword) {
      toast.error('Пароли не совпадают');
      return;
    }

    const { mode, user } = passwordDialog;
    setSavingPassword(true);
    try {
      if (mode === 'promote') {
        await api.post(`/admins/${user.id}/promote`, { password: passwordForm.password });
        setCandidates((current) => current.filter((item) => item.id !== user.id));
        toast.success(`${user.firstName} назначен администратором`);
      } else {
        await api.post(`/admins/${user.id}/password`, { password: passwordForm.password });
        toast.success(`Пароль для ${user.firstName} изменён`);
      }
      setPasswordDialog(null);
      setPasswordForm(EMPTY_PASSWORD);
      await loadAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Не удалось сохранить пароль администратора');
    } finally {
      setSavingPassword(false);
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
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openPasswordDialog('reset', admin)}
                    >
                      Сменить пароль
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => demote(admin)}>Снять права</Button>
                  </div>
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
          <Input
            label="Первоначальный пароль"
            type={showCreatePassword ? 'text' : 'password'}
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            required
          />
          <Input
            label="Повторите пароль"
            type={showCreatePassword ? 'text' : 'password'}
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
            required
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showCreatePassword}
              onChange={(event) => setShowCreatePassword(event.target.checked)}
              className="h-4 w-4 accent-slate-900"
            />
            Показать пароль
          </label>
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
                <Button size="sm" onClick={() => openPasswordDialog('promote', candidate)}>Назначить</Button>
              </div>
            ))}
            {!searching && search && candidates.length === 0 && (
              <p className="py-5 text-sm text-center text-slate-400">Подходящие пользователи не найдены</p>
            )}
          </div>
        </section>
      </div>

      {passwordDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {passwordDialog.mode === 'promote' ? 'Назначить администратора' : 'Сменить пароль'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {passwordDialog.user.firstName} {passwordDialog.user.lastName}
            </p>
            <form onSubmit={saveAdminPassword} className="mt-5 space-y-4">
              <Input
                label="Новый пароль"
                type={showDialogPassword ? 'text' : 'password'}
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
                value={passwordForm.password}
                onChange={(event) => setPasswordForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))}
                required
                autoFocus
              />
              <Input
                label="Повторите пароль"
                type={showDialogPassword ? 'text' : 'password'}
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({
                  ...current,
                  confirmPassword: event.target.value,
                }))}
                required
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={showDialogPassword}
                  onChange={(event) => setShowDialogPassword(event.target.checked)}
                  className="h-4 w-4 accent-slate-900"
                />
                Показать пароль
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={closePasswordDialog}>
                  Отмена
                </Button>
                <Button type="submit" loading={savingPassword}>
                  {passwordDialog.mode === 'promote' ? 'Назначить' : 'Сохранить'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
