/**
 * Minimal cron expression parser.
 *
 * Supports 5-field (minute-level) and 6-field (second-level) expressions:
 * - 5 fields: `minute hour day-of-month month day-of-week`
 * - 6 fields: `second minute hour day-of-month month day-of-week`
 *
 * Field syntax: `*`, `N`, `N-M` (range), `N,M,O` (list), `N/S` and `N-M/S` (step)
 *
 * Day names: SUN, MON, TUE, WED, THU, FRI, SAT
 * Month names: JAN, FEB, MAR, APR, MAY, JUN, JUL, AUG, SEP, OCT, NOV, DEC
 *
 * Aliases: `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight`, `@hourly`
 */

const ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}

const DAY_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
}

const MONTH_NAMES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
}

/** Computes the next date matching the cron expression strictly after `from`. */
export function _nextCronTick(expression: string, from: Date): Date {
  const resolved = ALIASES[expression.trim()] ?? expression
  const fields = resolved.trim().split(/\s+/)
  const hasSeconds = fields.length === 6

  const secondSet = hasSeconds ? parseField(fields[0], 0, 59) : new Set([0])
  const minuteSet = parseField(fields[hasSeconds ? 1 : 0], 0, 59)
  const hourSet = parseField(fields[hasSeconds ? 2 : 1], 0, 23)
  const domSet = parseField(fields[hasSeconds ? 3 : 2], 1, 31)
  const monthSet = parseField(fields[hasSeconds ? 4 : 3], 1, 12, MONTH_NAMES)
  const dowSet = parseField(fields[hasSeconds ? 5 : 4], 0, 6, DAY_NAMES)

  const next = new Date(from.getTime())

  if (hasSeconds) {
    next.setSeconds(next.getSeconds() + 1, 0)
  } else {
    next.setMinutes(next.getMinutes() + 1)
    next.setSeconds(0, 0)
  }

  // Search up to 4 years ahead to handle all month/dow combinations
  const limit = from.getTime() + 4 * 365 * 24 * 60 * 60 * 1000

  while (next.getTime() < limit) {
    if (!monthSet.has(next.getMonth() + 1)) {
      next.setMonth(next.getMonth() + 1, 1)
      next.setHours(0, 0, 0, 0)
      continue
    }

    if (!domSet.has(next.getDate()) || !dowSet.has(next.getDay())) {
      next.setDate(next.getDate() + 1)
      next.setHours(0, 0, 0, 0)
      continue
    }

    if (!hourSet.has(next.getHours())) {
      next.setHours(next.getHours() + 1, 0, 0, 0)
      continue
    }

    if (!minuteSet.has(next.getMinutes())) {
      next.setMinutes(next.getMinutes() + 1, 0, 0)
      continue
    }

    if (!secondSet.has(next.getSeconds())) {
      next.setSeconds(next.getSeconds() + 1, 0)
      continue
    }

    return next
  }

  throw new Error(
    `No matching cron tick found within 4 years for: ${expression}`,
  )
}

function parseField(
  field: string,
  min: number,
  max: number,
  names?: Record<string, number>,
): Set<number> {
  const values = new Set<number>()

  for (const part of field.split(',')) {
    const resolved = names ? replaceNames(part, names) : part

    if (resolved === '*') {
      for (let i = min; i <= max; i++) values.add(i)
    } else if (resolved.includes('/')) {
      const [base, stepStr] = resolved.split('/')
      const step = parseInt(stepStr, 10)
      let start: number
      let end: number
      if (base === '*') {
        start = min
        end = max
      } else if (base.includes('-')) {
        const [lo, hi] = base.split('-').map(Number)
        start = lo
        end = hi
      } else {
        start = parseInt(base, 10)
        end = max
      }
      for (let i = start; i <= end; i += step) values.add(i)
    } else if (resolved.includes('-')) {
      const [lo, hi] = resolved.split('-').map(Number)
      for (let i = lo; i <= hi; i++) values.add(i)
    } else {
      values.add(parseInt(resolved, 10))
    }
  }

  return values
}

function replaceNames(field: string, names: Record<string, number>): string {
  return field.replace(
    /[A-Z]{3}/gi,
    (match) => String(names[match.toUpperCase()] ?? match),
  )
}
