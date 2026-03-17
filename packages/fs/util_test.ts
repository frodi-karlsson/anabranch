import { assertEquals, assertExists } from '@std/assert'
import { copyFile, ensureDir, exists, remove, stat } from './index.ts'
import { join } from 'node:path'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

let tmp: string

async function setup(): Promise<void> {
  tmp = await mkdtemp(join(tmpdir(), 'anabranch-fs-util-'))
}

async function teardown(): Promise<void> {
  await remove(tmp).run()
}

// exists

Deno.test('exists - should return true for existing file', async () => {
  await setup()
  try {
    const file = join(tmp, 'hello.txt')
    await writeFile(file, 'hi')

    assertEquals(await exists(file).run(), true)
  } finally {
    await teardown()
  }
})

Deno.test('exists - should return false for missing path', async () => {
  await setup()
  try {
    assertEquals(await exists(join(tmp, 'nope')).run(), false)
  } finally {
    await teardown()
  }
})

Deno.test('exists - should return true for existing directory', async () => {
  await setup()
  try {
    assertEquals(await exists(tmp).run(), true)
  } finally {
    await teardown()
  }
})

// ensureDir

Deno.test('ensureDir - should create nested directories', async () => {
  await setup()
  try {
    const nested = join(tmp, 'a', 'b', 'c')
    await ensureDir(nested).run()

    assertEquals(await exists(nested).run(), true)
  } finally {
    await teardown()
  }
})

Deno.test('ensureDir - should be idempotent on existing dir', async () => {
  await setup()
  try {
    await ensureDir(tmp).run()
    assertEquals(await exists(tmp).run(), true)
  } finally {
    await teardown()
  }
})

// remove

Deno.test('remove - should remove a file', async () => {
  await setup()
  try {
    const file = join(tmp, 'to-delete.txt')
    await writeFile(file, 'bye')
    assertEquals(await exists(file).run(), true)

    await remove(file).run()
    assertEquals(await exists(file).run(), false)
  } finally {
    await teardown()
  }
})

Deno.test('remove - should remove a directory recursively', async () => {
  await setup()
  try {
    const dir = join(tmp, 'nested')
    await ensureDir(join(dir, 'sub')).run()
    await writeFile(join(dir, 'sub', 'file.txt'), 'content')

    await remove(dir).run()
    assertEquals(await exists(dir).run(), false)
  } finally {
    await teardown()
  }
})

Deno.test('remove - should be idempotent on missing path', async () => {
  await setup()
  try {
    await remove(join(tmp, 'does-not-exist')).run()
  } finally {
    await teardown()
  }
})

// copyFile

Deno.test('copyFile - should copy file contents', async () => {
  await setup()
  try {
    const src = join(tmp, 'source.txt')
    const dst = join(tmp, 'dest.txt')
    await writeFile(src, 'hello copy')

    await copyFile(src, dst).run()

    const result = await stat(dst).run()
    assertExists(result)
    assertEquals(result.size, 'hello copy'.length)
  } finally {
    await teardown()
  }
})

Deno.test('copyFile - should error on missing source', async () => {
  await setup()
  try {
    const result = await copyFile(
      join(tmp, 'nope.txt'),
      join(tmp, 'dest.txt'),
    ).result()

    assertEquals(result.type, 'error')
  } finally {
    await teardown()
  }
})

// stat

Deno.test('stat - should return file metadata', async () => {
  await setup()
  try {
    const file = join(tmp, 'meta.txt')
    await writeFile(file, 'metadata test')

    const info = await stat(file).run()

    assertEquals(info.isFile, true)
    assertEquals(info.isDirectory, false)
    assertEquals(info.isSymlink, false)
    assertEquals(info.size, 'metadata test'.length)
    assertExists(info.mtime)
    assertExists(info.atime)
    assertExists(info.birthtime)
  } finally {
    await teardown()
  }
})

Deno.test('stat - should return directory metadata', async () => {
  await setup()
  try {
    const info = await stat(tmp).run()

    assertEquals(info.isFile, false)
    assertEquals(info.isDirectory, true)
  } finally {
    await teardown()
  }
})

Deno.test('stat - should error on missing path', async () => {
  await setup()
  try {
    const result = await stat(join(tmp, 'nope')).result()
    assertEquals(result.type, 'error')
  } finally {
    await teardown()
  }
})
