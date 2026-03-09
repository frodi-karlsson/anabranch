import { assertEquals, assertInstanceOf } from '@std/assert'
import { readFile, readJson, readLines, readTextFile } from './read.ts'
import { FSError, InvalidData, NotFound } from './errors.ts'
import { ErrorResult, SuccessResult } from '@anabranch/anabranch'

Deno.test({
  name: 'readLines - should stream file lines',
  permissions: { read: true, write: true },
  async fn() {
    const dir = await Deno.makeTempDir()
    const path = `${dir}/lines.txt`
    await Deno.writeTextFile(path, 'alpha\nbeta\ngamma')
    try {
      const results = await readLines(path).toArray()
      assertEquals(results, [
        { type: 'success', value: 'alpha' },
        { type: 'success', value: 'beta' },
        { type: 'success', value: 'gamma' },
      ])
    } finally {
      await Deno.remove(dir, { recursive: true })
    }
  },
})

Deno.test({
  name: 'readLines - should handle an empty file',
  permissions: { read: true, write: true },
  async fn() {
    const dir = await Deno.makeTempDir()
    const path = `${dir}/empty.txt`
    await Deno.writeTextFile(path, '')
    try {
      const results = await readLines(path).toArray()
      assertEquals(results, [])
    } finally {
      await Deno.remove(dir, { recursive: true })
    }
  },
})

Deno.test({
  name: 'readLines - should emit NotFound error for missing file',
  permissions: { read: true },
  async fn() {
    const path = '/nonexistent/path/file.txt'
    const results = await readLines(path).toArray()
    assertEquals(results.length, 1)
    const first = results[0] as { type: string; error: FSError }
    assertEquals(first.type, 'error')
    assertInstanceOf(first.error, FSError)
    assertInstanceOf(first.error, NotFound)
    assertEquals(first.error.kind, 'NotFound')
    assertEquals(first.error.path, path)
  },
})

Deno.test({
  name: 'readTextFile - should read entire file as string',
  permissions: { read: true, write: true },
  async fn() {
    const dir = await Deno.makeTempDir()
    const path = `${dir}/text.txt`
    await Deno.writeTextFile(path, 'hello world')
    try {
      const result = await readTextFile(path).result()
      assertEquals(result.type, 'success')
      assertEquals((result as { value: string }).value, 'hello world')
    } finally {
      await Deno.remove(dir, { recursive: true })
    }
  },
})

Deno.test({
  name: 'readTextFile - should emit NotFound error for missing file',
  permissions: { read: true },
  async fn() {
    const path = '/nonexistent/file.txt'
    const result = await readTextFile(path).result()
    assertEquals(result.type, 'error')
    const err = (result as ErrorResult<unknown, FSError>).error
    assertInstanceOf(err, FSError)
    assertInstanceOf(err, NotFound)
    assertEquals(err.kind, 'NotFound')
    assertEquals(err.path, path)
  },
})

Deno.test({
  name: 'readJson - should read and parse a JSON file',
  permissions: { read: true, write: true },
  async fn() {
    const dir = await Deno.makeTempDir()
    const path = `${dir}/data.json`
    await Deno.writeTextFile(path, '{"name":"alice","age":30}')
    try {
      const result = await readJson<{ name: string; age: number }>(path)
        .result()
      assertEquals(result.type, 'success')
      assertEquals(
        (result as { value: { name: string; age: number } }).value,
        { name: 'alice', age: 30 },
      )
    } finally {
      await Deno.remove(dir, { recursive: true })
    }
  },
})

Deno.test({
  name: 'readJson - should emit InvalidData for malformed JSON',
  permissions: { read: true, write: true },
  async fn() {
    const dir = await Deno.makeTempDir()
    const path = `${dir}/bad.json`
    await Deno.writeTextFile(path, '{invalid json}')
    try {
      const result = await readJson(path).result()
      assertEquals(result.type, 'error')
      const err = (result as ErrorResult<unknown, FSError>).error
      assertInstanceOf(err, FSError)
      assertInstanceOf(err, InvalidData)
      assertEquals(err.kind, 'InvalidData')
      assertEquals(err.path, path)
    } finally {
      await Deno.remove(dir, { recursive: true })
    }
  },
})

Deno.test({
  name: 'readJson - should emit NotFound error for missing file',
  permissions: { read: true },
  async fn() {
    const path = '/nonexistent/file.json'
    const result = await readJson(path).result()
    assertEquals(result.type, 'error')
    const err = (result as ErrorResult<unknown, FSError>).error
    assertInstanceOf(err, FSError)
    assertInstanceOf(err, NotFound)
    assertEquals(err.kind, 'NotFound')
    assertEquals(err.path, path)
  },
})

Deno.test({
  name: 'readFile - should read entire file as Uint8Array',
  permissions: { read: true, write: true },
  async fn() {
    const dir = await Deno.makeTempDir()
    const path = `${dir}/bytes.bin`
    const data = new Uint8Array([1, 2, 3, 4, 5])
    await Deno.writeFile(path, data)
    try {
      const result = await readFile(path).result()
      assertEquals(result.type, 'success')
      assertEquals(
        (result as SuccessResult<Uint8Array, FSError>).value,
        data,
      )
    } finally {
      await Deno.remove(dir, { recursive: true })
    }
  },
})

Deno.test({
  name: 'readFile - should emit NotFound error for missing file',
  permissions: { read: true },
  async fn() {
    const path = '/nonexistent/file.bin'
    const result = await readFile(path).result()
    assertEquals(result.type, 'error')
    const err = (result as ErrorResult<unknown, FSError>).error
    assertInstanceOf(err, FSError)
    assertInstanceOf(err, NotFound)
    assertEquals(err.kind, 'NotFound')
    assertEquals(err.path, path)
  },
})
