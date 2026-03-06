import { FSErrors, readJson } from "../index.ts";

interface Config {
  port: number;
  host: string;
}

function getDefaultConfig(): Config {
  return { port: 3000, host: "localhost" };
}

async function loadConfig(configPath: string): Promise<Config> {
  return await readJson<Config>(configPath)
    .recoverWhen(
      (err) =>
        err instanceof FSErrors.NotFound || err instanceof FSErrors.InvalidData,
      () => {
        console.error(
          `Config file not found or invalid, using defaults`,
        );
        return getDefaultConfig();
      },
    )
    .recoverWhen(
      (err) => err instanceof FSErrors.PermissionDenied,
      () => {
        throw new Error("Cannot proceed without config file permissions.");
      },
    )
    .run();
}

async function main(): Promise<void> {
  const config = await loadConfig("./config.json");
  console.log(`Loaded config: port=${config.port}, host=${config.host}`);
}

main().catch(console.error);
