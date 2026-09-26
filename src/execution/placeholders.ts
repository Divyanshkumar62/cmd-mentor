import readline from 'node:readline';
import process from 'node:process';
import { CommandEntry } from '../types/command.js';
import { extractPlaceholders, sanitizeParameter } from '../safety/sanitizer.js';

export interface PlaceholderPrompt {
  name: string;
  /** Example value drawn from the entry, shown as a hint. */
  hint?: string;
}

export type PlaceholderOutcome =
  | { filled: true; values: Record<string, string> }
  | { filled: false; reason: 'canceled' | 'no-tty' };

/**
 * Builds the prompt list for a command line, using the entry's own examples to
 * suggest a realistic value for each placeholder where one can be inferred.
 */
export function buildPrompts(commandLine: string, entry?: CommandEntry): PlaceholderPrompt[] {
  const names = extractPlaceholders(commandLine);
  return names.map((name) => ({ name, hint: inferHint(name, entry) }));
}

/**
 * Looks for a concrete value in the entry's examples by aligning the template
 * against an example that has the same shape. `mkdir <directory>` alongside the
 * example `mkdir project` yields the hint "project".
 */
function inferHint(name: string, entry?: CommandEntry): string | undefined {
  if (!entry) return undefined;

  const templateTokens = entry.commandTemplate.split(/\s+/);
  const slot = templateTokens.findIndex((t) => t === `<${name}>`);
  if (slot === -1) return undefined;

  for (const example of entry.examples) {
    const exampleTokens = example.command.split(/\s+/);
    if (exampleTokens.length !== templateTokens.length) continue;
    const candidate = exampleTokens[slot];
    if (candidate && !candidate.startsWith('<')) {
      return candidate;
    }
  }
  return undefined;
}

function ask(
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
    rl.on('close', () => settle(''));
  });
}

export interface CollectOptions {
  prompts: PlaceholderPrompt[];
  /** Values supplied non-interactively, e.g. via repeated --set name=value. */
  preset?: Record<string, string>;
  input?: NodeJS.ReadableStream & { isTTY?: boolean };
  output?: NodeJS.WritableStream;
}

/**
 * Collects a value for each placeholder. Preset values are used as-is (still
 * sanitized); anything left over is prompted for on an interactive terminal.
 * Rejected input is re-prompted rather than accepted, and an empty answer with
 * no hint cancels - filling a command with blanks is never the safe default.
 */
export async function collectPlaceholderValues(
  options: CollectOptions
): Promise<PlaceholderOutcome> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const preset = options.preset ?? {};
  const values: Record<string, string> = {};

  const outstanding: PlaceholderPrompt[] = [];
  for (const prompt of options.prompts) {
    if (Object.prototype.hasOwnProperty.call(preset, prompt.name)) {
      values[prompt.name] = sanitizeParameter(preset[prompt.name]!);
    } else {
      outstanding.push(prompt);
    }
  }

  if (outstanding.length === 0) {
    return { filled: true, values };
  }

  if (!input.isTTY) {
    return { filled: false, reason: 'no-tty' };
  }

  for (const prompt of outstanding) {
    const label = prompt.hint
      ? `  <${prompt.name}> (e.g. ${prompt.hint}): `
      : `  <${prompt.name}>: `;

    // Re-prompt on rejected input rather than aborting the whole command.
    for (let attempt = 0; attempt < 3; attempt++) {
      const answer = (await ask(label, input, output)).trim();

      if (!answer) {
        if (prompt.hint) {
          values[prompt.name] = prompt.hint;
          break;
        }
        return { filled: false, reason: 'canceled' };
      }

      try {
        values[prompt.name] = sanitizeParameter(answer);
        break;
      } catch (err) {
        output.write(
          `  Rejected: ${err instanceof Error ? err.message : String(err)}\n`
        );
        if (attempt === 2) {
          return { filled: false, reason: 'canceled' };
        }
      }
    }
  }

  return { filled: true, values };
}

/** Parses repeated `--set name=value` pairs into a record. */
export function parseSetPairs(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq <= 0) {
      throw new Error(`Invalid --set value "${pair}". Expected the form name=value.`);
    }
    out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return out;
}
