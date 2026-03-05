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
- Test names follow the pattern `Container.method - should description`.
