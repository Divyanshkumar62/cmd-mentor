import readline from 'node:readline';
import process from 'node:process';
import { ExecutionPolicy } from '../types/safety.js';

export type ConfirmationOutcome =
  | { confirmed: true; unattended?: boolean }
  | { confirmed: false; reason: 'declined' | 'no-tty' | 'blocked' };

export interface ConfirmOptions {
  policy: ExecutionPolicy;
  /**
   * Set by `--yes`. Never bypasses RESTRICTED, and never bypasses HIGH unless
   * paired with the explicit CMDMENTOR_ALLOW_UNATTENDED_HIGH_RISK=1 opt-in.
   */
  assumeYes?: boolean;
  input?: NodeJS.ReadableStream & { isTTY?: boolean };
  output?: NodeJS.WritableStream;
  /** Injected for testing; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

/** Reads a single line, resolving to '' if the stream closes first. */
function readLine(
  prompt: string,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream
): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output });
    let settled = false;
    const settle = (answer: string) => {
      if (settled) return;
      settled = true;
      resolve(answer);
    };

    rl.question(prompt, (answer) => {
      settle(answer);
      rl.close();
    });
    // If the stream ends before an answer arrives, treat it as no input.
    rl.on('close', () => settle(''));
  });
}

/**
 * Opt-in escape hatch for automated testing of high-risk commands.
 *
 * Deliberately awkward to trigger: it requires BOTH this environment variable
 * set to exactly "1" AND an explicit `--yes` on the command. The variable alone
 * arms nothing, so a stray `export` in a shell profile cannot quietly turn a
 * developer's machine into one where `rm -rf` runs unattended.
 *
 * It never applies to `restricted` commands, which remain unexecutable.
 */
export const UNATTENDED_HIGH_RISK_ENV = 'CMDMENTOR_ALLOW_UNATTENDED_HIGH_RISK';

export function unattendedHighRiskAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[UNATTENDED_HIGH_RISK_ENV] === '1';
}

/**
 * Gates execution behind an explicit human decision (PRD FR-009).
 *
 * Rules, in order:
 *  - `restricted` never executes, regardless of flags, env, or answers.
 *  - HIGH risk requires a typed `YES` on an interactive TTY. `--yes` alone does
 *    NOT satisfy it; a destructive irreversible action should not be reachable
 *    from a script by a single flag. The sole exception is the explicit
 *    `CMDMENTOR_ALLOW_UNATTENDED_HIGH_RISK=1` opt-in combined with `--yes`,
 *    intended for CI that deliberately exercises destructive paths.
 *  - Everything else accepts `--yes`, else prompts [y/N] on a TTY.
 *  - Without a TTY and without `--yes`, execution is refused rather than
 *    assumed - silence is never consent.
 */
export async function confirmExecution(
  options: ConfirmOptions
): Promise<ConfirmationOutcome> {
  const { policy, assumeYes = false } = options;
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const env = options.env ?? process.env;

  if (!policy.canExecute) {
    return { confirmed: false, reason: 'blocked' };
  }

  const isInteractive = Boolean(input.isTTY);

  if (policy.requiresStrictUppercaseConfirm) {
    // Both signals are required: the deliberate env opt-in and an explicit --yes.
    if (assumeYes && unattendedHighRiskAllowed(env)) {
      return { confirmed: true, unattended: true };
    }
    if (!isInteractive) {
      return { confirmed: false, reason: 'no-tty' };
    }
    const answer = await readLine(
      "Type 'YES' (uppercase) to confirm this high-risk execution: ",
      input,
      output
    );
    return answer.trim() === 'YES'
      ? { confirmed: true }
      : { confirmed: false, reason: 'declined' };
  }

  if (assumeYes) {
    return { confirmed: true };
  }

  if (!isInteractive) {
    return { confirmed: false, reason: 'no-tty' };
  }

  const answer = await readLine('Execute this command? [y/N] ', input, output);
  const normalized = answer.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes'
    ? { confirmed: true }
    : { confirmed: false, reason: 'declined' };
}
