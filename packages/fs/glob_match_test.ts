import { assertEquals } from "@std/assert";
import { _matchGlob } from "./glob_match.ts";

Deno.test("_matchGlob - should match * against non-separator chars", () => {
  const re = _matchGlob("*.ts");
  assertEquals(re.test("foo.ts"), true);
  assertEquals(re.test("index.ts"), true);
  assertEquals(re.test("foo.tsx"), false);
  assertEquals(re.test("foo.ts.bak"), false);
  // * does not cross directory separators
  assertEquals(re.test("src/foo.ts"), false);
});

Deno.test("_matchGlob - should match ** across separators", () => {
  const re = _matchGlob("**/*.ts");
  assertEquals(re.test("foo.ts"), true);
  assertEquals(re.test("src/foo.ts"), true);
  assertEquals(re.test("src/deep/foo.ts"), true);
  assertEquals(re.test("src/foo.tsx"), false);
});

Deno.test("_matchGlob - should match ** without trailing slash", () => {
  const re = _matchGlob("src/**");
  assertEquals(re.test("src/foo.ts"), true);
  assertEquals(re.test("src/deep/foo.ts"), true);
  assertEquals(re.test("other/foo.ts"), false);
});

Deno.test("_matchGlob - should match ? against a single non-separator char", () => {
  const re = _matchGlob("fo?.ts");
  assertEquals(re.test("foo.ts"), true);
  assertEquals(re.test("fob.ts"), true);
  assertEquals(re.test("fo.ts"), false);
  assertEquals(re.test("fooo.ts"), false);
  assertEquals(re.test("fo/.ts"), false);
});

Deno.test("_matchGlob - should match {a,b} alternatives", () => {
  const re = _matchGlob("{foo,bar}.ts");
  assertEquals(re.test("foo.ts"), true);
  assertEquals(re.test("bar.ts"), true);
  assertEquals(re.test("baz.ts"), false);
});

Deno.test("_matchGlob - should match nested glob in alternatives", () => {
  const re = _matchGlob("{*.ts,*.tsx}");
  assertEquals(re.test("foo.ts"), true);
  assertEquals(re.test("foo.tsx"), true);
  assertEquals(re.test("foo.js"), false);
});

Deno.test("_matchGlob - should match [abc] character class", () => {
  const re = _matchGlob("[fb]oo.ts");
  assertEquals(re.test("foo.ts"), true);
  assertEquals(re.test("boo.ts"), true);
  assertEquals(re.test("zoo.ts"), false);
});

Deno.test("_matchGlob - should escape regex special chars in literals", () => {
  const re = _matchGlob("file.test.ts");
  assertEquals(re.test("file.test.ts"), true);
  // the dots must not act as regex wildcards
  assertEquals(re.test("fileXtestXts"), false);
});
