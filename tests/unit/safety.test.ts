import { describe, it, expect } from 'vitest';
import { getExecutionPolicy } from '../../src/safety/policy.js';
import { sanitizeParameter, interpolateTemplate, splitCommandArgs } from '../../src/safety/sanitizer.js';
import { CommandEntry } from '../../src/types/command.js';

describe('Safety Policy & Classification', () => {
  const baseEntry: CommandEntry = {
    id: 'test.cmd',
    name: 'test',
    title: 'Test Command',
    description: 'Test Description',
    commandTemplate: 'test',
    platforms: ['linux', 'windows'],
    shells: ['bash', 'powershell'],
    category: ['test'],
    tags: ['test'],
    aliases: ['test'],
    flags: [],
    examples: [{ command: 'test', explanation: 'test' }],
    risk: { level: 'low', destructive: false, requiresElevation: false },
    verification: { status: 'reviewed', lastReviewed: '2026-09-22', source: 'Test' },
  };

  it('allows informational and low risk commands with standard confirmation', () => {
    const policyInfo = getExecutionPolicy({
      ...baseEntry,
      risk: { level: 'informational', destructive: false, requiresElevation: false },
    });
    expect(policyInfo.canExecute).toBe(true);
    expect(policyInfo.requiresStrictUppercaseConfirm).toBe(false);

    const policyLow = getExecutionPolicy({
      ...baseEntry,
      risk: { level: 'low', destructive: false, requiresElevation: false },
    });
    expect(policyLow.canExecute).toBe(true);
    expect(policyLow.requiresStrictUppercaseConfirm).toBe(false);
  });

  it('requires strict uppercase confirmation for high risk commands', () => {
    const policyHigh = getExecutionPolicy({
      ...baseEntry,
      risk: { level: 'high', destructive: true, requiresElevation: false },
    });
    expect(policyHigh.canExecute).toBe(true);
    expect(policyHigh.requiresStrictUppercaseConfirm).toBe(true);
    expect(policyHigh.warningNotice).toContain('DESTRUCTIVE');
  });

  it('blocks execution for restricted commands', () => {
    const policyRestricted = getExecutionPolicy({
      ...baseEntry,
      risk: { level: 'restricted', destructive: true, requiresElevation: true },
    });
    expect(policyRestricted.canExecute).toBe(false);
    expect(policyRestricted.warningNotice).toContain('BLOCKED');
  });

  it('warns when administrator elevation is required', () => {
    const policyElevated = getExecutionPolicy({
      ...baseEntry,
      risk: { level: 'moderate', destructive: false, requiresElevation: true },
    });
    expect(policyElevated.warningNotice).toContain('ELEVATION');
  });
});

describe('Safety Argument Sanitizer & Interpolation', () => {
  it('allows valid alphanumeric and path characters', () => {
    expect(sanitizeParameter('my-folder_123')).toBe('my-folder_123');
    expect(sanitizeParameter('src/components/Button.tsx')).toBe('src/components/Button.tsx');
    expect(sanitizeParameter('C:\\Users\\Project')).toBe('C:\\Users\\Project');
  });

  it('rejects shell metacharacters that allow command chaining or injection', () => {
    expect(() => sanitizeParameter('folder; rm -rf /')).toThrow(/invalid characters/i);
    expect(() => sanitizeParameter('folder && calc.exe')).toThrow(/invalid characters/i);
    expect(() => sanitizeParameter('folder | bash')).toThrow(/invalid characters/i);
    expect(() => sanitizeParameter('`whoami`')).toThrow(/invalid characters/i);
    expect(() => sanitizeParameter('$(id)')).toThrow(/invalid characters/i);
    expect(() => sanitizeParameter('test > /dev/null')).toThrow(/invalid characters/i);
    expect(() => sanitizeParameter('line1\nline2')).toThrow(/invalid characters/i);
  });

  it('interpolates template placeholders safely', () => {
    const template = 'mkdir <directory>';
    const filled = interpolateTemplate(template, { directory: 'new_project' });
    expect(filled).toBe('mkdir new_project');
  });

  it('throws error when placeholder contains injection payload', () => {
    const template = 'mkdir <directory>';
    expect(() => interpolateTemplate(template, { directory: 'proj; rm -rf /' })).toThrow();
  });

  it('splits command line into structured argument vector for spawn', () => {
    const args = splitCommandArgs('git commit -m "feat: offline search engine" --quiet');
    expect(args[0]).toBe('git');
    expect(args[1]).toBe('commit');
    expect(args[2]).toBe('-m');
    expect(args[3]).toBe('feat: offline search engine');
    expect(args[4]).toBe('--quiet');
  });
});
