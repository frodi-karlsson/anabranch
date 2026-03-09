import { assertEquals } from '@std/assert'
import { AggregateError } from '../index.ts'

Deno.test('AggregateError - should set message and errors', () => {
  const error1 = new Error('Error 1')
  const error2 = new Error('Error 2')
  const aggregateError = new AggregateError([error1, error2])

  assertEquals(aggregateError.name, 'AggregateError')
  assertEquals(aggregateError.message, 'AggregateError: 2 errors')
  assertEquals(aggregateError.errors, [error1, error2])
})
