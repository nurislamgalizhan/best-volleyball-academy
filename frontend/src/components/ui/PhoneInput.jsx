import { formatPhoneLocalPart, normalizePhoneInput } from '../../utils/phone.js';

export default function PhoneInput({
  label,
  error,
  value,
  onChange,
  placeholder = '(777) 123 45 67',
  className = '',
  ...props
}) {
  const handleChange = (event) => {
    const nextValue = normalizePhoneInput(event.target.value);
    onChange?.(nextValue);
  };

  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}
      <div
        className={`flex items-center rounded-lg border bg-white transition-colors focus-within:ring-2 focus-within:ring-brand-500 ${
          error ? 'border-red-400 bg-red-50' : 'border-slate-200 hover:border-slate-300'
        } ${className}`}
      >
        <span className="px-3 text-sm font-medium text-slate-500 border-r border-slate-200">+7</span>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          className="w-full px-3 py-2.5 rounded-r-lg text-sm bg-transparent focus:outline-none"
          value={formatPhoneLocalPart(value)}
          onChange={handleChange}
          placeholder={placeholder}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
