import { assertEquals, assertGreater, assertLess } from '@std/assert'
import { _nextCronTick } from './cron.ts'
import { Source } from '../index.ts'

const cases: {
  name: string
  cron: string
  from: Date
  expect: {
    month?: number
    date?: number
    day?: number
    hour?: number
    minute?: number
    year?: number
  }
}[] = [
  {
    name: 'every minute',
    cron: '* * * * *',
    from: new Date(2026, 0, 15, 10, 30, 45),
    expect: { date: 15, hour: 10, minute: 31 },
  },
  {
    name: 'specific minute',
    cron: '45 * * * *',
    from: new Date(2026, 0, 15, 10, 30, 0),
    expect: { hour: 10, minute: 45 },
  },
  {
    name: 'minute wraps to next hour',
    cron: '15 * * * *',
    from: new Date(2026, 0, 15, 10, 50, 0),
    expect: { hour: 11, minute: 15 },
  },
  {
    name: 'specific hour and minute',
    cron: '30 14 * * *',
    from: new Date(2026, 0, 15, 8, 0, 0),
    expect: { date: 15, hour: 14, minute: 30 },
  },
  {
    name: 'wraps to next day',
    cron: '0 9 * * *',
    from: new Date(2026, 0, 15, 23, 30, 0),
    expect: { date: 16, hour: 9, minute: 0 },
  },
  {
    name: 'every 5 minutes',
    cron: '*/5 * * * *',
    from: new Date(2026, 0, 15, 10, 12, 0),
    expect: { minute: 15 },
  },
  {
    name: 'specific day of month',
    cron: '0 0 20 * *',
    from: new Date(2026, 0, 15, 10, 0, 0),
    expect: { date: 20, hour: 0, minute: 0 },
  },
  {
    name: 'specific day of week (Monday=1)',
    cron: '0 9 * * 1',
    from: new Date(2026, 0, 15, 10, 0, 0), // Thursday
    expect: { date: 19, hour: 9 },
  },
  {
    name: 'range 1-5 (weekdays)',
    cron: '0 9 * * 1-5',
    from: new Date(2026, 0, 17, 10, 0, 0), // Saturday
    expect: { date: 19, hour: 9 },
  },
  {
    name: 'list 0,15,30,45',
    cron: '0,15,30,45 * * * *',
    from: new Date(2026, 0, 15, 10, 16, 0),
    expect: { minute: 30 },
  },
  {
    name: 'range with step 1-30/5',
    cron: '1-30/5 * * * *',
    from: new Date(2026, 0, 15, 10, 3, 0),
    expect: { minute: 6 },
  },
  {
    name: 'range with step 0-23/2 (even hours)',
    cron: '0 0-23/2 * * *',
    from: new Date(2026, 0, 15, 9, 59, 0),
    expect: { hour: 10, minute: 0 },
  },
  {
    name: '@yearly',
    cron: '@yearly',
    from: new Date(2026, 3, 15, 10, 0, 0),
    expect: { year: 2027, month: 0, date: 1, hour: 0, minute: 0 },
  },
  {
    name: '@monthly',
    cron: '@monthly',
    from: new Date(2026, 0, 15, 10, 0, 0),
    expect: { month: 1, date: 1, hour: 0 },
  },
  {
    name: '@weekly',
    cron: '@weekly',
    from: new Date(2026, 0, 15, 10, 0, 0), // Thursday
    expect: { day: 0, hour: 0 },
  },
  {
    name: '@daily',
    cron: '@daily',
    from: new Date(2026, 0, 15, 10, 0, 0),
    expect: { date: 16, hour: 0, minute: 0 },
  },
  {
    name: '@hourly',
    cron: '@hourly',
    from: new Date(2026, 0, 15, 10, 30, 0),
    expect: { hour: 11, minute: 0 },
  },
  {
    name: 'day name MON',
    cron: '0 9 * * MON',
    from: new Date(2026, 0, 15, 10, 0, 0), // Thursday
    expect: { date: 19, day: 1 },
  },
  {
    name: 'day name range MON-FRI',
    cron: '0 9 * * MON-FRI',
    from: new Date(2026, 0, 17, 10, 0, 0), // Saturday
    expect: { date: 19, day: 1 },
  },
  {
    name: 'month name JAN',
    cron: '0 0 1 JAN *',
    from: new Date(2026, 1, 15, 10, 0, 0), // Feb
    expect: { year: 2027, month: 0 },
  },
  {
    name: 'month name range MAR-MAY',
    cron: '0 0 1 MAR-MAY *',
    from: new Date(2026, 0, 15, 10, 0, 0), // Jan
    expect: { month: 2, date: 1 },
  },
]

for (const { name, cron, from, expect: e } of cases) {
  Deno.test(`_nextCronTick - ${name}`, () => {
    const next = _nextCronTick(cron, from)
    if (e.year !== undefined) assertEquals(next.getFullYear(), e.year, 'year')
    if (e.month !== undefined) assertEquals(next.getMonth(), e.month, 'month')
    if (e.date !== undefined) assertEquals(next.getDate(), e.date, 'date')
    if (e.day !== undefined) assertEquals(next.getDay(), e.day, 'day')
    if (e.hour !== undefined) assertEquals(next.getHours(), e.hour, 'hour')
    if (e.minute !== undefined) {
      assertEquals(next.getMinutes(), e.minute, 'minute')
    }
  })
}

// Source.fromSchedule tests

Deno.test('Source.fromSchedule - should yield ticks', async () => {
  const ac = new AbortController()

  const ticks = await Source.fromSchedule('* * * * * *', {
    signal: ac.signal,
  })
    .tap(() => ac.abort())
    .take(1)
    .collect()

  assertEquals(ticks.length, 1)
  assertGreater(ticks[0].scheduledAt.getTime(), 0)
  assertEquals(ticks[0].index, 0)
})

Deno.test('Source.fromSchedule - should stop on signal abort', async () => {
  const ac = new AbortController()

  setTimeout(() => ac.abort(), 50)

  const ticks = await Source.fromSchedule('* * * * * *', {
    signal: ac.signal,
  }).collect()

  assertLess(ticks.length, 3)
})
