import { assertEquals } from '@std/assert'
import { createGithub } from './check-runs-github.ts'

const defaultOptions = {
  token: 'test-token',
  owner: 'test-owner',
  repo: 'test-repo',
}

Deno.test('createGithub - should return CheckRuns instance', () => {
  const checkRuns = createGithub(defaultOptions)
  assertEquals(typeof checkRuns.create, 'function')
  assertEquals(typeof checkRuns.start, 'function')
  assertEquals(typeof checkRuns.update, 'function')
  assertEquals(typeof checkRuns.complete, 'function')
  assertEquals(typeof checkRuns.watch, 'function')
})

Deno.test('createGithub - should work with baseUrl option', () => {
  const checkRuns = createGithub({
    ...defaultOptions,
    baseUrl: 'https://github.example.com/api/v3',
  })
  assertEquals(typeof checkRuns.create, 'function')
})
