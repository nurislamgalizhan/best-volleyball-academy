import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { startOfDay, endOfDay, format } from 'date-fns';
import api from '../../api/axios.js';
import { useVisitLogs, useSaleLogs } from '../../hooks/useLogs.js';
import { useAdminSocket } from '../../hooks/useSocket.js';
import DateRangePicker from '../../components/ui/DateRangePicker.jsx';
import Pagination from '../../components/ui/Pagination.jsx';

const TIME_TYPE_LABEL = { ANY: 'Любое', MORNING: 'Утро', EVENING: 'Вечер' };
const PAYMENT_LABEL = { CASH: 'Наличные', KASPI: 'Kaspi', HALYK: 'Halyk', MIXED: 'Смешанная' };
const EXPORT_PAGE_SIZE = 100;

function paymentDisplay(sale) {
  if (sale.paymentMethod === 'MIXED') {
    const cardLbl = sale.cardProvider === 'HALYK' ? 'Halyk' : 'Kaspi';
    return `Смеш. (${(sale.cashAmount || 0).toLocaleString()} нал. + ${(sale.cardAmount || 0).toLocaleString()} ${cardLbl})`;
  }
  return PAYMENT_LABEL[sale.paymentMethod] || '—';
}

function downloadWorkbook(XLSX, workbook, fileName) {
  const lib = XLSX.default ?? XLSX;
  const buffer = lib.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadCsv(rows, fileName) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function fetchAllPages(path, params) {
  const allRows = [];
  let page = 1;
  let pages = 1;

  do {
    const { data } = await api.get(path, {
      params: { ...params, page, limit: EXPORT_PAGE_SIZE },
    });

    allRows.push(...data.data);
    pages = data.meta?.pages || 1;
    page += 1;
  } while (page <= pages);

  return allRows;
}

export default function AccountingPage() {
  const [tab, setTab] = useState('visits');
  const [dateRange, setDateRange] = useState({
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  });
  const [visitPage, setVisitPage] = useState(1);
  const [salePage, setSalePage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const { logs: visitLogs, meta: visitMeta, loading: visitLoading, fetchLogs: fetchVisits, prependLog } = useVisitLogs();
  const { logs: saleLogs, meta: saleMeta, loading: saleLoading, fetchLogs: fetchSales } = useSaleLogs();

  const loadVisits = useCallback(() => {
    fetchVisits({ page: visitPage, from: dateRange.from, to: dateRange.to });
  }, [visitPage, dateRange, fetchVisits]);

  const loadSales = useCallback(() => {
    fetchSales({ page: salePage, from: dateRange.from, to: dateRange.to });
  }, [salePage, dateRange, fetchSales]);

  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useAdminSocket((visitLog) => {
    if (tab === 'visits' && visitPage === 1) {
      prependLog(visitLog);
    }
  });

  const handleDateChange = (range) => {
    setDateRange(range);
    setVisitPage(1);
    setSalePage(1);
  };

  const fetchExportData = async () => {
    const exportFrom = dateRange.from ?? startOfDay(new Date());
    const exportTo = dateRange.to ?? endOfDay(new Date());
    const params = { from: exportFrom.toISOString(), to: exportTo.toISOString() };
    const [visits, sales] = await Promise.all([
      fetchAllPages('/visits', params),
      fetchAllPages('/sales', params),
    ]);
    const visitsData = visits.map((visit) => ({
      'Дата': format(new Date(visit.createdAt), 'dd.MM.yyyy HH:mm'),
      'Клиент': `${visit.user?.firstName ?? ''} ${visit.user?.lastName ?? ''}`.trim(),
      'Телефон': visit.user?.phone ?? '',
      'Гости': visit.guestCount ?? 0,
      'Списано': visit.visitsDeducted,
    }));
    const salesData = sales.map((sale) => ({
      'Дата': format(new Date(sale.createdAt), 'dd.MM.yyyy HH:mm'),
      'Клиент': `${sale.user?.firstName ?? ''} ${sale.user?.lastName ?? ''}`.trim(),
      'Телефон': sale.user?.phone ?? '',
      'Тариф': sale.tariff?.name ?? '',
      'Сумма': sale.pricePaid,
      'Способ оплаты': PAYMENT_LABEL[sale.paymentMethod] || '',
      'Наличными': sale.cashAmount ?? 0,
      'Картой': sale.cardAmount ?? 0,
      'Провайдер карты': sale.cardProvider ? (sale.cardProvider === 'KASPI' ? 'Kaspi' : 'Halyk') : '',
    }));
    const dateLabel = `${format(exportFrom, 'dd.MM.yyyy')}-${format(exportTo, 'dd.MM.yyyy')}`;
    const totals = sales.reduce(
      (acc, s) => {
        acc.total += s.pricePaid || 0;
        const cash = s.cashAmount || 0;
        const card = s.cardAmount || 0;
        acc.cash += cash;
        if (s.cardProvider === 'KASPI') acc.kaspi += card;
        else if (s.cardProvider === 'HALYK') acc.halyk += card;
        else if (s.paymentMethod === 'KASPI') acc.kaspi += card || s.pricePaid || 0;
        else if (s.paymentMethod === 'HALYK') acc.halyk += card || s.pricePaid || 0;
        return acc;
      },
      { total: 0, cash: 0, kaspi: 0, halyk: 0 }
    );
    return { visitsData, salesData, dateLabel, totals };
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const XLSXModule = await import('xlsx');
      const XLSX = XLSXModule.default ?? XLSXModule;
      const { visitsData, salesData, dateLabel, totals } = await fetchExportData();

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(visitsData.length ? visitsData : [{ 'Дата': 'Нет данных' }]),
        'Посещения'
      );

      const salesWithTotals = salesData.length
        ? [
            ...salesData,
            {},
            { 'Дата': 'Итого', 'Сумма': totals.total },
            { 'Дата': 'Kaspi', 'Сумма': totals.kaspi },
            { 'Дата': 'Halyk', 'Сумма': totals.halyk },
            { 'Дата': 'Наличные', 'Сумма': totals.cash },
          ]
        : [{ 'Дата': 'Нет данных' }];
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(salesWithTotals),
        'Продажи'
      );

      downloadWorkbook(XLSX, workbook, `бухгалтерия_${dateLabel}.xlsx`);
      toast.success('Excel-файл успешно выгружен');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Ошибка экспорта Excel');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const { visitsData, salesData, dateLabel, totals } = await fetchExportData();
      const salesWithTotals = salesData.length
        ? [
            ...salesData,
            { 'Дата': '', 'Клиент': '', 'Телефон': '', 'Тариф': '', 'Сумма': '', 'Способ оплаты': '', 'Наличными': '', 'Картой': '', 'Провайдер карты': '' },
            { 'Дата': 'Итого', 'Клиент': '', 'Телефон': '', 'Тариф': '', 'Сумма': totals.total, 'Способ оплаты': '', 'Наличными': '', 'Картой': '', 'Провайдер карты': '' },
            { 'Дата': 'Kaspi', 'Клиент': '', 'Телефон': '', 'Тариф': '', 'Сумма': totals.kaspi, 'Способ оплаты': '', 'Наличными': '', 'Картой': '', 'Провайдер карты': '' },
            { 'Дата': 'Halyk', 'Клиент': '', 'Телефон': '', 'Тариф': '', 'Сумма': totals.halyk, 'Способ оплаты': '', 'Наличными': '', 'Картой': '', 'Провайдер карты': '' },
            { 'Дата': 'Наличные', 'Клиент': '', 'Телефон': '', 'Тариф': '', 'Сумма': totals.cash, 'Способ оплаты': '', 'Наличными': '', 'Картой': '', 'Провайдер карты': '' },
          ]
        : salesData;
      const rows = tab === 'visits' ? visitsData : salesWithTotals;
      const fileName = tab === 'visits' ? `посещения_${dateLabel}.csv` : `продажи_${dateLabel}.csv`;
      if (!rows.length) {
        toast.error('Нет данных для выгрузки за выбранный период');
        return;
      }
      downloadCsv(rows, fileName);
      toast.success('CSV-файл успешно выгружен');
    } catch (err) {
      console.error('CSV export error:', err);
      toast.error('Ошибка экспорта CSV');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Бухгалтерия</h1>
        <div className="flex items-center gap-2">
          <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={handleDateChange} />
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? '...' : 'CSV'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? 'Экспорт...' : 'Excel'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-6">
        {[{ id: 'visits', label: 'Посещения' }, { id: 'sales', label: 'Продажи' }].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === item.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'visits' && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Всего: <span className="font-semibold text-slate-800">{visitMeta.total}</span>
            </p>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Реал-тайм
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Дата</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Клиент</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide hidden sm:table-cell">Телефон</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Гости</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Списано</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visitLoading ? (
                  [...Array(10)].map((_, index) => (
                    <tr key={index}>
                      <td colSpan={5} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : visitLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Нет данных за выбранный период</td>
                  </tr>
                ) : (
                  visitLogs.map((visit) => (
                    <tr
                      key={visit.id}
                      className={`transition-colors ${visit._isNew ? 'animate-flash-green' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{format(new Date(visit.createdAt), 'dd.MM.yyyy HH:mm')}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {visit.user?.firstName} {visit.user?.lastName}
                        {visit._isNew && <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Новое</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{visit.user?.phone}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{visit.guestCount ?? 0}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">−{visit.visitsDeducted}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-100">
            <Pagination page={visitPage} pages={visitMeta.pages} onPageChange={setVisitPage} />
          </div>
        </div>
      )}

      {tab === 'sales' && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-slate-500">
              Всего: <span className="font-semibold text-slate-800">{saleMeta.total}</span>
            </p>
            <p className="text-sm font-semibold text-emerald-600">
              Выручка: {(saleMeta.totalRevenue || 0).toLocaleString()} тг
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Дата</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Клиент</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide hidden sm:table-cell">Тариф</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Оплата</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {saleLoading ? (
                  [...Array(10)].map((_, index) => (
                    <tr key={index}>
                      <td colSpan={5} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : saleLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Нет продаж за выбранный период</td>
                  </tr>
                ) : (
                  saleLogs.map((sale) => {
                    const isCash = sale.paymentMethod === 'CASH';
                    const isKaspi = sale.paymentMethod === 'KASPI' || (sale.paymentMethod === 'MIXED' && sale.cardProvider === 'KASPI');
                    const isHalyk = sale.paymentMethod === 'HALYK' || (sale.paymentMethod === 'MIXED' && sale.cardProvider === 'HALYK');
                    return (
                      <tr key={sale.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{format(new Date(sale.createdAt), 'dd.MM.yyyy HH:mm')}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{sale.user?.firstName} {sale.user?.lastName}</p>
                          <p className="text-xs text-slate-400">{sale.user?.phone}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <p className="text-slate-800">{sale.tariff?.name}</p>
                          <p className="text-xs text-slate-400">{TIME_TYPE_LABEL[sale.tariff?.timeType]}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isKaspi && <img src="/icons/kaspi.svg" alt="Kaspi" className="w-5 h-5" title="Kaspi" />}
                            {isHalyk && <img src="/icons/halyk.svg" alt="Halyk" className="w-5 h-5" title="Halyk" />}
                            {(isCash || sale.paymentMethod === 'MIXED') && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">₸ нал.</span>
                            )}
                            <span className="text-xs text-slate-500">{paymentDisplay(sale)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600 whitespace-nowrap">{sale.pricePaid.toLocaleString()} тг</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-100">
            <Pagination page={salePage} pages={saleMeta.pages} onPageChange={setSalePage} />
          </div>
        </div>
      )}
    </div>
  );
}
