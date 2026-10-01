import { describe, it, expect } from 'vitest';
import {
  formatPlainDetail,
  formatPlainSearchResults,
  formatPlainStats,
  formatPlainValidation,
} from '../../src/output/plain.js';
import { CommandEntry } from '../../src/types/command.js';

describe('Plain Output Formatter', () => {
  const sampleEntry: CommandEntry = {
    id: 'filesystem.mkdir.posix',
    name: 'mkdir',
    title: 'Create a directory',
    description: 'Creates one or more directories with optional parent path creation.',
    commandTemplate: 'mkdir <directory>',
    platforms: ['linux', 'macos', 'windows'],
    shells: ['bash', 'zsh', 'powershell', 'cmd'],
    category: ['filesystem'],
    tags: ['folder', 'directory', 'create'],
    aliases: ['create a folder'],
    flags: [
      {
        name: '-p',
        description: 'Create parent directories as needed.',
      },
    ],
    examples: [
      {
        command: 'mkdir project',
        explanation: 'Creates a directory named project.',
      },
    ],
    risk: {
      level: 'low',
      destructive: false,
      requiresElevation: false,
      sideEffects: 'Allocates directory inode.',
      reversibility: 'Reversible using rmdir.',
    },
    verification: {
      status: 'reviewed',
      lastReviewed: '2026-09-22',
      source: 'POSIX standard',
    },
  };

  it('formats search results as plain text table', () => {
    const output = formatPlainSearchResults([sampleEntry]);
    expect(output).toContain('mkdir');
    expect(output).toContain('Create a directory');
    expect(output).toContain('LOW');
  });

  it('handles empty search results message', () => {
    const output = formatPlainSearchResults([]);
    expect(output).toContain('No matching commands found');
  });

  it('formats detail view as plain text with all sections', () => {
    const output = formatPlainDetail(sampleEntry);
    expect(output).toContain('Command: mkdir');
    expect(output).toContain('mkdir <directory>');
    expect(output).toContain('Flags:');
    expect(output).toContain('-p');
    expect(output).toContain('Examples:');
    expect(output).toContain('mkdir project');
    expect(output).toContain('Risk Level:         LOW');
  });

  it('formats stats as plain text', () => {
    const output = formatPlainStats({
      count: 25,
      categories: ['filesystem', 'git'],
      platforms: ['windows', 'linux'],
      schemaVersion: '1.0.0',
      contentVersion: '2026.09.22',
    });
    expect(output).toContain('Total Commands:');
    expect(output).toContain('25');
    expect(output).toContain('Schema Version:  1.0.0');
    expect(output).toContain('filesystem');
  });

  it('formats validation reports for valid and invalid datasets', () => {
    const validReport = formatPlainValidation({
      valid: true,
      totalEntries: 10,
      validEntries: 10,
      invalidEntries: 0,
      errors: [],
      duplicateIds: [],
    });
    expect(validReport).toContain('PASSED (100% Valid)');

    const invalidReport = formatPlainValidation({
      valid: false,
      totalEntries: 2,
      validEntries: 1,
      invalidEntries: 1,
      errors: [{ id: 'bad.id', errors: ['name is required'] }],
      duplicateIds: ['dup.id'],
    });
    expect(invalidReport).toContain('FAILED');
    expect(invalidReport).toContain('bad.id');
    expect(invalidReport).toContain('dup.id');
  });
});
