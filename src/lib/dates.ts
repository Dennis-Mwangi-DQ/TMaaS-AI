export function toIsoDate(input: Date): string {
  return input.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function parseYesNo(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (['yes', 'y', 'yeah', 'yep', 'true'].includes(normalized)) {
    return true;
  }
  if (['no', 'n', 'nope', 'false'].includes(normalized)) {
    return false;
  }
  return null;
}

export function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
