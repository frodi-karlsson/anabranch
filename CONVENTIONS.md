# Conventions

- Private class members have no `_` prefix.
- Exported symbols not exposed in `index.ts` get a `_` prefix.
- Newsletter ordering: things that consume go above things they consume —
  interfaces below the classes that use them, helper functions at the bottom of
  test files.
- Prefer function declarations over `const` arrow functions.
- No default values for internal parameters where the caller can always be
  explicit; use destructured objects for boolean flags (e.g.
  `{ skipFilter }: { skipFilter: boolean }`).
- Configurable classes use a private constructor, a static `create()` factory,
  and immutable `with*()` chaining methods instead of a public constructor with
  an options bag. Each `with*()` method returns a new instance. The options
  interface is internal — do not export it.
- Test names follow the pattern `Container.method - should description`.
- All exported symbols must have JSDoc with a one-line summary. Use `@default`
  for default values and `@example` for usage examples. Avoid `@param`,
  `@returns`, and redundant type information in documentation.
