/**
 * Shell metacharacters that must never reach an argument value. Rejecting these
 * is the trust boundary for user-supplied placeholder input: a value containing
 * any of them could alter control flow if the command were ever shell-evaluated.
 */
const DISALLOWED_CHARACTERS = /[;&|`$><\n\r\0]/;

/** Matches a `<placeholder>` token. Dots are allowed (`<archive.zip>`). */
const PLACEHOLDER_TOKEN = /<([a-zA-Z_][a-zA-Z0-9_.-]*)>/g;

export function sanitizeParameter(value: string): string {
  if (!value) {
    return '';
  }

  if (DISALLOWED_CHARACTERS.test(value)) {
    throw new Error(
      `Security Exception: Input contains invalid characters or shell metacharacters: "${value}"`
    );
  }

  return value.trim();
}

/** Every distinct placeholder name appearing in a template, in order. */
export function extractPlaceholders(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER_TOKEN)) {
    const name = match[1]!;
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Substitutes `<name>` tokens with sanitized values.
 *
 * Replacement is driven by the template's own tokens rather than by the keys of
 * `params`, so a key cannot be interpreted as a regular expression and an
 * unknown key cannot silently do nothing. Values are sanitized individually and
 * inserted literally - never re-parsed.
 */
export function interpolateTemplate(template: string, params: Record<string, string>): string {
  return template.replace(PLACEHOLDER_TOKEN, (token, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      // Leave unknown placeholders intact; the execution gate refuses them,
      // which is safer than substituting an empty string.
      return token;
    }
    return sanitizeParameter(params[name]!);
  });
}

export function splitCommandArgs(commandLine: string): string[] {
  const tokens: string[] = [];
  let currentToken = '';
  let insideQuotes: false | '"' | "'" = false;
  let isEscaped = false;
  let tokenStarted = false;

  for (let i = 0; i < commandLine.length; i++) {
    const char = commandLine[i];

    if (isEscaped) {
      currentToken += char;
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      tokenStarted = true;
      continue;
    }

    if (insideQuotes) {
      if (char === insideQuotes) {
        insideQuotes = false;
      } else {
        currentToken += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      insideQuotes = char;
      // A quoted empty string is still an argument: cmd ""
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(char!)) {
      if (tokenStarted) {
        tokens.push(currentToken);
        currentToken = '';
        tokenStarted = false;
      }
      continue;
    }

    currentToken += char;
    tokenStarted = true;
  }

  if (tokenStarted) {
    tokens.push(currentToken);
  }

  return tokens;
}
