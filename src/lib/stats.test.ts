import { describe, expect, it } from 'vitest';
import { addDays, dateRange, daysBetween, movingAverage } from './stats';

describe('dates', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
  it('lists an inclusive range', () => {
    expect(dateRange('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(dateRange('2026-10-21', '2026-10-21')).toEqual(['2026-10-21']);
    expect(dateRange('2026-10-22', '2026-10-21')).toEqual([]);
  });
  it('counts days', () => {
    expect(daysBetween('2026-10-15', '2026-10-21')).toBe(6);
  });
  it('rejects bad dates', () => {
    expect(() => addDays('21/10/2026', 1)).toThrow(/bad date/);
  });
});

describe('movingAverage', () => {
  it('averages over a calendar window, not the last N readings', () => {
    const r = movingAverage([
      { date: '2026-10-01', value: 70 },
      { date: '2026-10-02', value: 72 },
      { date: '2026-10-10', value: 68 }, // gap: earlier readings fall out of the 7-day window
    ]);
    expect(r.map((p) => p.avg)).toEqual([70, 71, 68]);
  });
  it('sorts input by date', () => {
    const r = movingAverage([
      { date: '2026-10-03', value: 3 },
      { date: '2026-10-01', value: 1 },
    ]);
    expect(r.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-03']);
    expect(r[1].avg).toBe(2);
  });
});
