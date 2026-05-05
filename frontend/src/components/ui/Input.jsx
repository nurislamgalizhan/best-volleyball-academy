export default function Input({ label, error, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      )}
      <input
        className={`w-full px-3 py-2.5 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${
          error ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
