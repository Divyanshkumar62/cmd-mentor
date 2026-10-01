import { describe, it, expect } from 'vitest';
import { render } from 'ink';
import { Writable } from 'node:stream';
import { ExecutionModal } from '../../src/tui/components/ExecutionModal.js';
import { CommandEntry } from '../../src/types/command.js';
import { EnvironmentContext } from '../../src/types/environment.js';

class MockStdout extends Writable {
  output = '';
  columns = 100;
  rows = 30;

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.output += chunk.toString();
    callback();
  }
}

const environment: EnvironmentContext = {
  platform: 'linux',
  shell: 'bash',
  cwd: '/home/dev/project',
  terminal: { isTTY: true, columns: 100, rows: 30, colorDepth: 8, hasUnicode: true },
  isAmbiguousShell: false,
  rawPlatform: 'linux',
};

const base: CommandEntry = {
  id: 'test.demo',
  name: 'demo',
  title: 'Demo command',
  description: 'Demo.',
  commandTemplate: 'demo <target>',
  platforms: ['linux'],
  shells: ['bash'],
  category: ['test'],
  tags: ['demo'],
  aliases: ['demo'],
  flags: [],
  examples: [{ command: 'demo thing', explanation: 'Runs it.' }],
  risk: { level: 'low', destructive: false, requiresElevation: false },
  verification: { status: 'reviewed', lastReviewed: '2026-09-22', source: 'test' },
};

function renderModal(entry: CommandEntry): string {
  const stdout = new MockStdout();
  const instance = render(
    <ExecutionModal entry={entry} environment={environment} onBack={() => {}} />,
    { stdout: stdout as unknown as NodeJS.WriteStream, patchConsole: false }
  );
  const out = stdout.output;
  instance.unmount();
  return out;
}

describe('ExecutionModal gating', () => {
  it('offers a normal confirmation for a runnable low-risk command', () => {
    const out = renderModal(base);
    expect(out).toContain('demo thing');
    expect(out).toContain('Execute this command?');
  });

  it('demands typed YES for a high-risk command', () => {
    const out = renderModal({
      ...base,
      risk: { level: 'high', destructive: true, requiresElevation: false },
    });
    expect(out).toContain('YES');
    expect(out).not.toContain('Execute this command? [Y] Yes');
  });

  it('blocks a restricted command outright', () => {
    const out = renderModal({
      ...base,
      risk: { level: 'restricted', destructive: true, requiresElevation: false },
    });
    expect(out).toContain('blocked by safety policy');
    expect(out).not.toContain('Execute this command?');
  });

  it('refuses a shell-dependent command instead of offering to run it', () => {
    const out = renderModal({
      ...base,
      requiresShell: true,
      examples: [{ command: 'demo a | grep b', explanation: 'x' }],
    });
    expect(out).toContain('cannot be executed');
    expect(out).not.toContain('Execute this command?');
  });

  it('prompts for placeholders before offering confirmation', () => {
    // No concrete example, so the command line still carries <target>.
    const out = renderModal({
      ...base,
      examples: [{ command: 'demo <target>', explanation: 'x' }],
    });
    expect(out).toContain('Fill in placeholder 1 of 1');
    expect(out).toContain('target');
    expect(out).not.toContain('Execute this command?');
  });
});
