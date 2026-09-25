/**
 * Detects command strings that cannot be executed via structured `spawn` with
 * `shell: false`, because they depend on shell evaluation (pipes, redirection,
 * command substitution, variable expansion, chaining).
 *
 * Executing these through an argv array silently produces WRONG results - the
 * metacharacters are passed as literal arguments. Executing them through
 * `sh -c` / `powershell -Command` is the raw string evaluation the PRD (§13.3)
 * explicitly wants avoided. So CmdMentor refuses to execute them and offers the
 * command as reference/copy content instead.
 */

/** Shell metacharacters that change control flow or data flow. */
const SHELL_OPERATORS = /[|&;<>`]|\$[({\w]/;

/**
 * Unfilled `<placeholder>` tokens in a command template. Dots are allowed so
 * that `<archive.zip>` and `<script.js>` are recognised as placeholders rather
 * than being mistaken for shell redirection.
 */
const PLACEHOLDER_PATTERN = /<[a-zA-Z_][a-zA-Z0-9_.-]*>/;

export type ExecutionBlockReason = 'shell-evaluation' | 'unfilled-placeholder';

export interface ExecutabilityResult {
  executable: boolean;
  reason?: ExecutionBlockReason;
  detail?: string;
}

/**
 * True when the command line needs a shell interpreter to behave as written.
 * Note: a `<placeholder>` is NOT treated as redirection here - that case is
 * reported separately by `findUnfilledPlaceholders`.
 */
export function requiresShellEvaluation(commandLine: string): boolean {
  const withoutPlaceholders = commandLine.replace(
    new RegExp(PLACEHOLDER_PATTERN.source, 'g'),
    'PLACEHOLDER'
  );
  return SHELL_OPERATORS.test(withoutPlaceholders);
}

/** Returns every unfilled `<placeholder>` token remaining in the command. */
export function findUnfilledPlaceholders(commandLine: string): string[] {
  const matches = commandLine.match(
    new RegExp(PLACEHOLDER_PATTERN.source, 'g')
  );
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Single gate deciding whether a fully-expanded command line may be handed to
 * the execution runner. Both callers (CLI `exec` and the TUI modal) route
 * through this so the rules cannot drift apart.
 */
export function assessExecutability(commandLine: string): ExecutabilityResult {
  const placeholders = findUnfilledPlaceholders(commandLine);
  if (placeholders.length > 0) {
    return {
      executable: false,
      reason: 'unfilled-placeholder',
      detail: `Command still contains unfilled placeholder(s): ${placeholders.join(', ')}. Supply values before executing.`,
    };
  }

  if (requiresShellEvaluation(commandLine)) {
    return {
      executable: false,
      reason: 'shell-evaluation',
      detail:
        'This command relies on shell features (pipes, redirection, variables, or chaining) and cannot be executed safely by CmdMentor. Copy it and run it in your shell instead.',
    };
  }

  return { executable: true };
}
