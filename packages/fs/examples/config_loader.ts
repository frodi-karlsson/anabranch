/**
 * Example of using `readJson` to load a configuration file with error handling.
 *
 * Run:
 *
 * ```
 * deno run -A packages/fs/examples/config_loader.ts
 * ```
 *
 * This will attempt to read `config.json` in the current directory. If the file is missing or contains invalid JSON, it will log an error and use default configuration values. If the file exists but cannot be read due to permissions, it will throw an error and stop execution.
 */
import { InvalidData, NotFound, PermissionDenied, readJson } from '../index.ts'

interface Config {
  port: number
  host: string
}

function getDefaultConfig(): Config {
  return { port: 3000, host: 'localhost' }
}

async function loadConfig(configPath: string): Promise<Config> {
  return await readJson<Config>(configPath)
    .recoverWhen<NotFound | InvalidData, Config>(
      (err) => err instanceof NotFound || err instanceof InvalidData,
      () => {
        console.error(
          `Config file not found or invalid, using defaults`,
        )
        return getDefaultConfig()
      },
    )
    .recoverWhen<PermissionDenied, Config>(
      (err) => err instanceof PermissionDenied,
      () => {
        throw new Error('Cannot proceed without config file permissions.')
      },
    )
    .run()
}

async function main(): Promise<void> {
  const config = await loadConfig('./config.json')
  console.log(`Loaded config: port=${config.port}, host=${config.host}`)
}

main().catch(console.error)
