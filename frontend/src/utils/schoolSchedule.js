export const WEEKDAY_OPTIONS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const DEFAULT_OPERATING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function getOperatingDays(config) {
  if (!Array.isArray(config?.operating_days)) return DEFAULT_OPERATING_DAYS;
  return WEEKDAY_OPTIONS.filter(day => config.operating_days.includes(day));
}

export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLocalDayName(date = new Date()) {
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

export function getDefaultOperatingDay(operatingDays, date = new Date()) {
  const currentDay = getLocalDayName(date);
  return operatingDays.includes(currentDay) ? currentDay : operatingDays[0] || currentDay;
}
