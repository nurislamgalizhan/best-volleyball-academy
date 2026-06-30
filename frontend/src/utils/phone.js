export function normalizePhoneInput(value) {
  const rawValue = String(value || '').trim();
  const digits = rawValue.replace(/\D/g, '');
  if (!digits) return '';

  if (rawValue.startsWith('+7')) return digits.slice(1, 11);
  if (digits.length >= 11 && digits.startsWith('8')) return digits.slice(1, 11);
  if (digits.length >= 11 && digits.startsWith('7')) return digits.slice(1, 11);
  return digits.slice(0, 10);
}

export function getPhoneLocalPart(value) {
  return normalizePhoneInput(value);
}

export function toApiPhone(value) {
  const localPart = getPhoneLocalPart(value);
  return localPart.length === 10 ? `7${localPart}` : localPart;
}

export function isCompletePhone(value) {
  return getPhoneLocalPart(value).length === 10;
}

export function formatPhoneLocalPart(value) {
  const digits = getPhoneLocalPart(value);

  return [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 8),
    digits.slice(8, 10),
  ].filter(Boolean).join(' ');
}

export function formatPhoneDisplay(value) {
  const localPart = formatPhoneLocalPart(value);
  return localPart ? `+7 ${localPart}` : '';
}
