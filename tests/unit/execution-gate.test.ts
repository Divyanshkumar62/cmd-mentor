import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import {
  assessExecutability,
  requiresShellEvaluation,
  findUnfilledPlaceholders,
} from '../../src/safety/shell-requirement.js';
import { confirmExecution } from '../../src/execution/confirm.js';
import { executeCommand } from '../../src/execution/runner.js';
import { generateExecutionPreview } from '../../src/execution/preview.js';
import { ExecutionPolicy } from '../../src/types/safety.js';
import { CommandEntry } from '../../src/types/command.js';

function stream(answer: string, isTTY: boolean): NodeJS.ReadableStream & { isTTY?: boolean } {
  const s = new Readable({
    read() {
      this.push(answer + '\n');
      this.push(null);
    },
  }) as Readable & { isTTY?: boolean };
  s.isTTY = isTTY;
  return s;
}

const sink = { write: () => true } as unknown as NodeJS.WritableStream;

const policies: Record<string, ExecutionPolicy> = {
  informational: {
    level: 'informational',
    canExecute: true,
    requiresExplicitConfirmation: true,
    requiresStrictUppercaseConfirm: false,
  },
  high: {
    level: 'high',
    canExecute: true,
    requiresExplicitConfirmation: true,
    requiresStrictUppercaseConfirm: true,
  },
  restricted: {
    level: 'restricted',
    canExecute: false,
    requiresExplicitConfirmation: false,
    requiresStrictUppercaseConfirm: false,
  },
};

describe('Shell-requirement detection', () => {
  it('flags commands that depend on shell evaluation', () => {
    expect(requiresShellEvaluation('ps aux | grep node')).toBe(true);
    expect(requiresShellEvaluation('echo hi > out.txt')).toBe(true);
    expect(requiresShellEvaluation('npm test && npm run build')).toBe(true);
    expect(requiresShellEvaluation('echo `whoami`')).toBe(true);
    expect(requiresShellEvaluation('echo $HOME')).toBe(true);
    expect(requiresShellEvaluation('rm -rf /tmp/x; echo done')).toBe(true);
  });

  it('allows plain argv-style commands', () => {
    expect(requiresShellEvaluation('git status')).toBe(false);
    expect(requiresShellEvaluation('mkdir new_project')).toBe(false);
    expect(requiresShellEvaluation('docker logs -f web')).toBe(false);
  });

  it('does not mistake a placeholder for redirection', () => {
    expect(requiresShellEvaluation('mkdir <directory>')).toBe(false);
    expect(findUnfilledPlaceholders('mkdir <directory>')).toEqual(['<directory>']);
  });

  it('refuses commands with unfilled placeholders', () => {
    const result = assessExecutability('mkdir <directory>');
    expect(result.executable).toBe(false);
    expect(result.reason).toBe('unfilled-placeholder');
  });
});

describe('Execution confirmation gate (FR-009)', () => {
  it('requires typed uppercase YES for high-risk commands', async () => {
    await expect(
      confirmExecution({ policy: policies.high!, input: stream('YES', true), output: sink })
    ).resolves.toEqual({ confirmed: true });

    for (const answer of ['yes', 'y', 'Y', '']) {
      await expect(
        confirmExecution({ policy: policies.high!, input: stream(answer, true), output: sink })
      ).resolves.toEqual({ confirmed: false, reason: 'declined' });
    }
  });

  it('never lets --yes bypass a high-risk command', async () => {
    const outcome = await confirmExecution({
      policy: policies.high!,
      assumeYes: true,
      input: stream('', false),
      output: sink,
    });
    expect(outcome).toEqual({ confirmed: false, reason: 'no-tty' });
  });

  it('never executes restricted commands regardless of input', async () => {
    const outcome = await confirmExecution({
      policy: policies.restricted!,
      assumeYes: true,
      input: stream('YES', true),
      output: sink,
    });
    expect(outcome).toEqual({ confirmed: false, reason: 'blocked' });
  });

  it('treats an empty answer as No, never as consent', async () => {
    await expect(
      confirmExecution({ policy: policies.informational!, input: stream('', true), output: sink })
    ).resolves.toEqual({ confirmed: false, reason: 'declined' });
  });

  it('refuses to assume consent without a TTY', async () => {
    await expect(
      confirmExecution({ policy: policies.informational!, input: stream('y', false), output: sink })
    ).resolves.toEqual({ confirmed: false, reason: 'no-tty' });
  });

  it('accepts --yes for non-high-risk commands so scripts work', async () => {
    await expect(
      confirmExecution({
        policy: policies.informational!,
        assumeYes: true,
        input: stream('', false),
        output: sink,
      })
    ).resolves.toEqual({ confirmed: true });
  });
});

describe('Runner refuses unsafe command shapes', () => {
  it('rejects shell-requiring commands rather than mangling them', async () => {
    await expect(
      executeCommand({ commandLine: 'ps aux | grep node', executionEnabled: true })
    ).rejects.toThrow(/shell features/i);
  });

  it('rejects commands with unfilled placeholders', async () => {
    await expect(
      executeCommand({ commandLine: 'mkdir <directory>', executionEnabled: true })
    ).rejects.toThrow(/placeholder/i);
  });
});

describe('Preview honours explicit requiresShell marking', () => {
  const entry: CommandEntry = {
    id: 'test.shelly',
    name: 'shelly',
    title: 'Shell dependent command',
    description: 'Needs a shell to work',
    commandTemplate: 'shelly',
    platforms: ['linux'],
    shells: ['bash'],
    category: ['test'],
    tags: ['test'],
    aliases: [],
    flags: [],
    examples: [{ command: 'shelly --all', explanation: 'runs it' }],
    risk: { level: 'low', destructive: false, requiresElevation: false },
    verification: { status: 'reviewed', lastReviewed: '2026-09-22', source: 'Test' },
    requiresShell: true,
  };

  it('blocks execution even when the command line looks argv-safe', () => {
    const preview = generateExecutionPreview(entry);
    expect(preview.executability.executable).toBe(false);
    expect(preview.executability.reason).toBe('shell-evaluation');
  });
});

describe('Unattended high-risk escape hatch (CI opt-in)', () => {
  const env = (value?: string) =>
    value === undefined ? {} : { CMDMENTOR_ALLOW_UNATTENDED_HIGH_RISK: value };

  it('requires BOTH the env opt-in and --yes', async () => {
    // --yes alone: the original, deliberately strict behaviour.
    await expect(
      confirmExecution({
        policy: policies.high!,
        assumeYes: true,
        env: env(),
        input: stream('', false),
        output: sink,
      })
    ).resolves.toEqual({ confirmed: false, reason: 'no-tty' });

    // env alone arms nothing, so a stray export cannot change behaviour.
    await expect(
      confirmExecution({
        policy: policies.high!,
        assumeYes: false,
        env: env('1'),
        input: stream('', false),
        output: sink,
      })
    ).resolves.toEqual({ confirmed: false, reason: 'no-tty' });
  });

  it('permits the run only when both signals are present', async () => {
    const outcome = await confirmExecution({
      policy: policies.high!,
      assumeYes: true,
      env: env('1'),
      input: stream('', false),
      output: sink,
    });
    expect(outcome).toEqual({ confirmed: true, unattended: true });
  });

  it('accepts only the exact value "1"', async () => {
    for (const value of ['0', 'true', 'yes', 'TRUE', '']) {
      await expect(
        confirmExecution({
          policy: policies.high!,
          assumeYes: true,
          env: env(value),
          input: stream('', false),
          output: sink,
        }),
        `value "${value}" must not arm the hatch`
      ).resolves.toEqual({ confirmed: false, reason: 'no-tty' });
    }
  });

  it('never unlocks restricted commands', async () => {
    const outcome = await confirmExecution({
      policy: policies.restricted!,
      assumeYes: true,
      env: env('1'),
      input: stream('YES', true),
      output: sink,
    });
    expect(outcome).toEqual({ confirmed: false, reason: 'blocked' });
  });

  it('still prompts normally on a TTY rather than silently overriding', async () => {
    // With a terminal available the human is asked, hatch or not.
    const outcome = await confirmExecution({
      policy: policies.high!,
      assumeYes: false,
      env: env('1'),
      input: stream('YES', true),
      output: sink,
    });
    expect(outcome).toEqual({ confirmed: true });
  });
});
