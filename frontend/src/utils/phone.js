function getDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function normalizePhoneInput(value) {
  const digits = getDigits(value);

  if (!digits) return '';

  if (digits.length >= 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return digits.slice(1, 11);
  }

  return digits.slice(0, 10);
}

export function getPhoneLocalPart(value) {
  return normalizePhoneInput(value);
}

export function toApiPhone(value) {
  const localPart = getPhoneLocalPart(value);
  return localPart ? `7${localPart}` : '';
}

export function isCompletePhone(value) {
  return getPhoneLocalPart(value).length === 10;
}

export function formatPhoneLocalPart(value) {
  const digits = getPhoneLocalPart(value);

  if (!digits) return '';

  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 8);
  const part4 = digits.slice(8, 10);

  let result = '';

  if (part1) result += `(${part1}`;
  if (part1.length === 3) result += ')';
  if (part2) result += ` ${part2}`;
  if (part3) result += ` ${part3}`;
  if (part4) result += ` ${part4}`;

  return result.trim();
}

export function formatPhoneDisplay(value) {
  const localPart = formatPhoneLocalPart(value);
  return localPart ? `+7 ${localPart}` : '+7';
}
