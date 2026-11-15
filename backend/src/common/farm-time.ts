export function currentFarmDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

export function isSameDayAvailabilityOpen(now = new Date()): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now));
  return hour < 7;
}

export function isAvailabilityDateCurrent(date: string, now = new Date()): boolean {
  const key = date.slice(0, 10);
  const today = currentFarmDate(now);
  const sameDayOpen = isSameDayAvailabilityOpen(now);
  return key > today || (key === today && sameDayOpen);
}

export function filterCurrentAvailabilityDates(dates: string[], now = new Date()): string[] {
  return dates.filter((date) => isAvailabilityDateCurrent(date, now));
}
