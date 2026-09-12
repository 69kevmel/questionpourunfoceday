export const DEFAULT_SHOW_DATE = '2026-09-20';
export const DEFAULT_SHOW_TIME = '16:20';

const parisCalendar = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const parisTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Advance calendar dates, not UTC hours, to retain the Paris time across DST.
export function upcomingShows(now: number, anchor = '', count = 8): string[] {
  const validAnchor = anchor && Number.isFinite(Date.parse(anchor));
  const first = validAnchor
    ? new Date(anchor)
    : new Date(parisDateTime(DEFAULT_SHOW_DATE, DEFAULT_SHOW_TIME));
  const firstDate = parisCalendar.format(first);
  const time = parisTime.format(first);
  const date = new Date(`${firstDate}T00:00:00Z`);
  const today = Date.parse(`${parisCalendar.format(now)}T00:00:00Z`);
  const interval = 14 * 24 * 60 * 60 * 1000;
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.floor((today - date.getTime()) / interval)) * 14);
  const shows: string[] = [];
  while (shows.length < count) {
    const show = parisDateTime(date.toISOString().slice(0, 10), time);
    // Keep today's broadcast visible until midnight in Paris.
    if (parisCalendar.format(new Date(show)) >= parisCalendar.format(now)) shows.push(show);
    date.setUTCDate(date.getUTCDate() + 14);
  }
  return shows;
}

export function formatShow(date: string): string {
  return new Date(date).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function parisDateTime(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error('Renseigne une date et une heure valides.');
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(naive)) throw new Error('Date invalide.');
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const matches = [1, 2]
    .map((offset) => new Date(naive - offset * 3600000))
    .filter((candidate) => formatter.format(candidate) === `${date} ${time}`);
  if (matches.length !== 1)
    throw new Error('Cette heure est inexistante ou ambiguë au changement d’heure. Choisis une autre heure.');
  return matches[0].toISOString();
}
