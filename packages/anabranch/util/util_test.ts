import { assertEquals } from '@std/assert'

Deno.test('AggregateError - should set message and errors', () => {
  const error1 = new Error('first')
  const error2 = new Error('second')
  const aggregateError = new AggregateError(
    [error1, error2],
    '2 errors collected',
  )

  assertEquals(aggregateError.name, 'AggregateError')
  assertEquals(aggregateError.message, '2 errors collected')
  assertEquals(aggregateError.errors, [error1, error2])
})
