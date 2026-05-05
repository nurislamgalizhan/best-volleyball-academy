export default function Pagination({ page, pages, onPageChange }) {
  if (pages <= 1) return null;

  const getPages = () => {
    const items = [];
    const delta = 2;
    const range = [];
    for (let i = Math.max(2, page - delta); i <= Math.min(pages - 1, page + delta); i++) {
      range.push(i);
    }
    if (page - delta > 2) range.unshift('...');
    if (page + delta < pages - 1) range.push('...');
    range.unshift(1);
    if (pages > 1) range.push(pages);
    return range;
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 mt-4">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ←
      </button>
      {getPages().map((p, i) =>
        p === '...' ? (
          <span key={`dots-${i}`} className="px-2 text-slate-400">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              p === page
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === pages}
        className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        →
      </button>
    </div>
  );
}
