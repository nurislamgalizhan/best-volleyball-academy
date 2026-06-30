import { useRef } from 'react';
import { formatPhoneLocalPart, normalizePhoneInput } from '../../utils/phone.js';

export default function PhoneInput({
  label = 'Номер телефона',
  value,
  onChange,
  error,
  ...props
}) {
  const inputRef = useRef(null);

  const handleChange = (event) => {
    const nextValue = normalizePhoneInput(event.target.value);
    onChange(nextValue);
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'Backspace') return;

    const input = inputRef.current;
    if (!input || input.selectionStart !== input.selectionEnd) return;
    if (input.selectionStart === 0) return;

    const previousChar = input.value[input.selectionStart - 1];
    if (previousChar !== ' ') return;

    event.preventDefault();
    const digitsBeforeCursor = input.value.slice(0, input.selectionStart).replace(/\D/g, '');
    const digitsAfterCursor = input.value.slice(input.selectionStart).replace(/\D/g, '');
    const nextDigits = `${digitsBeforeCursor.slice(0, -1)}${digitsAfterCursor}`;
    onChange(normalizePhoneInput(nextDigits));
  };

  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}
      <div
        className={`flex items-center rounded-lg border bg-white transition-colors focus-within:ring-2 focus-within:ring-brand-500 ${
          error ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <span className="pl-3 pr-2 text-sm text-slate-500 select-none">+7</span>
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={formatPhoneLocalPart(value)}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent px-1 py-2.5 pr-3 text-sm outline-none"
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
