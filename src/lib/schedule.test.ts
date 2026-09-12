import { describe, expect, it } from 'vitest';
import { upcomingShows } from './schedule';

describe('calendrier des émissions', () => {
  it('programme les huit dimanches jusqu’à la fin de 2026', () => {
    const shows = upcomingShows(Date.parse('2026-09-12T12:00:00Z'));
    expect(shows.map((show) => show.slice(0, 10))).toEqual([
      '2026-09-20',
      '2026-10-04',
      '2026-10-18',
      '2026-11-01',
      '2026-11-15',
      '2026-11-29',
      '2026-12-13',
      '2026-12-27',
    ]);
    expect(shows[2]).toBe('2026-10-18T14:20:00.000Z');
    expect(shows[3]).toBe('2026-11-01T15:20:00.000Z');
  });

  it('garde l’émission du jour jusqu’à minuit à Paris', () => {
    expect(upcomingShows(Date.parse('2026-09-20T21:59:59Z'))[0]).toContain('2026-09-20');
    expect(upcomingShows(Date.parse('2026-09-20T22:00:00Z'))[0]).toContain('2026-10-04');
  });

  it('poursuit le calendrier en 2027 et conserve l’heure au passage à l’été', () => {
    expect(upcomingShows(Date.parse('2027-01-01T12:00:00Z'))[0]).toBe('2027-01-10T15:20:00.000Z');
    expect(upcomingShows(Date.parse('2027-03-22T12:00:00Z'))[0]).toBe('2027-04-04T14:20:00.000Z');
  });

  it('recale la récurrence sur le dimanche et l’horaire choisis par l’animateur', () => {
    expect(upcomingShows(Date.parse('2026-09-21T12:00:00Z'), '2026-09-27T16:00:00Z', 3)).toEqual([
      '2026-09-27T16:00:00.000Z',
      '2026-10-11T16:00:00.000Z',
      '2026-10-25T17:00:00.000Z',
    ]);
  });

  it('revient au calendrier prévu si la date enregistrée est invalide', () => {
    expect(upcomingShows(Date.parse('2026-09-12T12:00:00Z'), 'invalide', 1)).toEqual([
      '2026-09-20T14:20:00.000Z',
    ]);
  });
});
