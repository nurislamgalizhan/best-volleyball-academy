const TWELVE_HOURS_IN_MS = 12 * 60 * 60 * 1000;

function pluralize(value, forms) {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;

  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function getDuplicateVisitWarning(lastVisitAt) {
  if (!lastVisitAt) return null;

  const diffMs = Date.now() - new Date(lastVisitAt).getTime();
  if (diffMs < 0 || diffMs > TWELVE_HOURS_IN_MS) return null;

  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes} ${pluralize(diffMinutes, ['минуту', 'минуты', 'минут'])} назад`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours} ${pluralize(diffHours, ['час', 'часа', 'часов'])} назад`;
}

export function hasDuplicateVisitWindow(lastVisitAt) {
  return Boolean(getDuplicateVisitWarning(lastVisitAt));
}
