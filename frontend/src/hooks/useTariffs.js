import { useState, useCallback } from 'react';
import api from '../api/axios.js';
import toast from 'react-hot-toast';

export function useTariffs(onlyActive = false) {
  const [tariffs, setTariffs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTariffs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/tariffs', { params: onlyActive ? { active: true } : {} });
      setTariffs(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка загрузки тарифов');
    } finally {
      setLoading(false);
    }
  }, [onlyActive]);

  const createTariff = useCallback(async (payload) => {
    const { data } = await api.post('/tariffs', payload);
    return data;
  }, []);

  const updateTariff = useCallback(async (id, payload) => {
    const { data } = await api.patch(`/tariffs/${id}`, payload);
    return data;
  }, []);

  const deactivateTariff = useCallback(async (id) => {
    await api.delete(`/tariffs/${id}`);
  }, []);

  const activateTariff = useCallback(async (id) => {
    const { data } = await api.patch(`/tariffs/${id}`, { isActive: true });
    return data;
  }, []);

  return { tariffs, loading, fetchTariffs, createTariff, updateTariff, deactivateTariff, activateTariff };
}
