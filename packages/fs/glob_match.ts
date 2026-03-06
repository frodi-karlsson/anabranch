/**
 * Converts a glob pattern string to a `RegExp`.
 *
 * Supported syntax:
 * - `*` — any sequence of non-separator characters
 * - `**` — any sequence of characters including path separators
 * - `?` — any single non-separator character
 * - `{a,b}` — alternatives (may contain nested glob syntax)
 * - `[abc]` — character classes (passed through verbatim)
 *
 * The resulting regex is anchored (`^...$`) and should be tested against
 * forward-slash-normalised relative paths.
 */
export function _matchGlob(pattern: string): RegExp {
  return new RegExp(`^${patternToRegexStr(pattern)}$`);
}

function patternToRegexStr(pattern: string): string {
  const notSep = "[^/]";
  let regex = "";
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === "*") {
      if (i + 1 < pattern.length && pattern[i + 1] === "*") {
        regex += ".*";
        i += 2;
        // consume the separator that follows **, e.g. "**/"
        if (i < pattern.length && (pattern[i] === "/" || pattern[i] === "\\")) {
          i++;
        }
      } else {
        regex += `${notSep}*`;
        i++;
      }
    } else if (ch === "?") {
      regex += notSep;
      i++;
    } else if (ch === "{") {
      const end = pattern.indexOf("}", i + 1);
      if (end === -1) {
        regex += "\\{";
        i++;
      } else {
        const alternatives = pattern.slice(i + 1, end).split(",");
        regex += `(?:${alternatives.map(patternToRegexStr).join("|")})`;
        i = end + 1;
      }
    } else if (ch === "[") {
      const end = pattern.indexOf("]", i + 1);
      if (end === -1) {
        regex += "\\[";
        i++;
      } else {
        regex += pattern.slice(i, end + 1);
        i = end + 1;
      }
    } else {
      regex += escapeRegexChar(ch);
      i++;
    }
  }

  return regex;
}

function escapeRegexChar(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}
