import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';

export function useSections(onlyActive = false) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchSections = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sections', { params: onlyActive ? { active: true } : {} });
      setSections(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка загрузки секций');
    } finally {
      setLoading(false);
    }
  }, [onlyActive]);

  const createSection = useCallback(async (payload) => {
    const { data } = await api.post('/sections', payload);
    return data;
  }, []);

  const updateSection = useCallback(async (id, payload) => {
    const { data } = await api.patch(`/sections/${id}`, payload);
    return data;
  }, []);

  const deactivateSection = useCallback(async (id) => {
    await api.delete(`/sections/${id}`);
  }, []);

  const activateSection = useCallback(async (id) => {
    const { data } = await api.patch(`/sections/${id}`, { isActive: true });
    return data;
  }, []);

  return { sections, loading, fetchSections, createSection, updateSection, deactivateSection, activateSection };
}
