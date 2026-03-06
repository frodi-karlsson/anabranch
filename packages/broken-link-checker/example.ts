/**
 * Example: Check a website for broken links
 *
 * Usage:
 *   deno run -A --watch=clear example.ts
 *
 * This script crawls a website and reports any broken links it finds.
 */

import { BrokenLinkChecker } from "./index.ts";

async function main() {
  const site = "https://blog.frodikarlsson.com/";

  console.log(`\n🕷️  Broken Link Checker`);
  console.log(`   Checking: ${site}`);
  console.log(`---\n`);

  const startTime = Date.now();

  const checker = BrokenLinkChecker.create()
    .withConcurrency(5)
    .withTimeout(10_000)
    .withRetry({ attempts: 2, delay: (attempt) => 500 * 2 ** attempt })
    .withLogLevel("debug")
    .filterUrls((url) => {
      const path = url.pathname;
      if (
        path.endsWith(".png") ||
        path.endsWith(".jpg") ||
        path.endsWith(".svg")
      ) {
        return false;
      }
      if (path.endsWith(".css") || path.endsWith(".js")) {
        return false;
      }
      return true;
    })
    .keepBroken((result) => {
      return result.status !== 401 && result.status !== 403;
    });

  const { successes, errors } = await checker.check([site]).partition();

  const broken = successes.filter((r) => !r.ok);
  const ok = successes.filter((r) => r.ok);
  const duration = Date.now() - startTime;

  console.log(`\n---\n`);
  console.log(`📊 Results:`);
  console.log(`   Total checked: ${successes.length + errors.length}`);
  console.log(`   OK: ${ok.length}`);
  console.log(`   Broken: ${broken.length}`);
  console.log(`   Errors: ${errors.length}`);
  console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);

  if (broken.length > 0) {
    console.log(`\n❌ Broken links:`);
    for (const result of broken.slice(0, 20)) {
      const parent = result.parent?.href ?? "(seed)";
      console.log(`   ${result.status} ${result.url.href}`);
      console.log(`      from: ${parent}`);
    }
    if (broken.length > 20) {
      console.log(`   ... and ${broken.length - 20} more`);
    }
  } else {
    console.log(`\n✅ No broken links found!`);
  }
}

main().catch(console.error);
