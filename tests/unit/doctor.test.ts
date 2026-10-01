import { describe, it, expect } from 'vitest';
import { runDoctor } from '../../src/knowledge-base/doctor.js';
import { KnowledgeBaseLoader } from '../../src/knowledge-base/loader.js';
import { resolveKnowledgeDirectory } from '../../src/cli/index.js';
import { CommandEntry } from '../../src/types/command.js';

const base: CommandEntry = {
  id: 'test.cmd',
  name: 'demo',
  title: 'Demo command',
  description: 'A demo command used for testing.',
  commandTemplate: 'demo <target>',
  platforms: ['linux'],
  shells: ['bash'],
  category: ['test'],
  tags: ['demo'],
  aliases: ['run the demo'],
  flags: [],
  examples: [{ command: 'demo thing', explanation: 'Runs it.' }],
  risk: { level: 'low', destructive: false, requiresElevation: false },
  verification: { status: 'reviewed', lastReviewed: '2026-09-22', source: 'test' },
};

const checks = (entry: CommandEntry, kind: 'errors' | 'warnings') =>
  runDoctor([entry])[kind].map((f) => f.check);

describe('Doctor catches safety misclassification', () => {
  it('flags a destructive command classified as low risk', () => {
    const found = checks(
      { ...base, examples: [{ command: 'rm -rf ./build', explanation: 'x' }], requiresShell: false },
      'errors'
    );
    expect(found).toContain('risk-destructive');
    expect(found).toContain('risk-level');
  });

  it('flags git reset --hard that is not marked high risk', () => {
    const found = checks(
      {
        ...base,
        name: 'git',
        tags: ['git'],
        examples: [{ command: 'git reset --hard HEAD~1', explanation: 'x' }],
        risk: { level: 'moderate', destructive: true, requiresElevation: false },
      },
      'errors'
    );
    expect(found).toContain('risk-level');
  });

  it('flags a destructive entry classified as informational', () => {
    const found = checks(
      { ...base, risk: { level: 'informational', destructive: true, requiresElevation: false } },
      'errors'
    );
    expect(found).toContain('risk-level');
  });

  it('warns when a sudo command does not declare elevation', () => {
    const found = checks(
      {
        ...base,
        name: 'systemctl',
        tags: ['systemctl'],
        examples: [{ command: 'sudo systemctl restart nginx', explanation: 'x' }],
      },
      'warnings'
    );
    expect(found).toContain('risk-elevation');
  });
});

describe('Doctor catches shell-marking drift', () => {
  it('errors when a piped example is not marked requiresShell', () => {
    const found = checks(
      { ...base, examples: [{ command: 'demo a | grep b', explanation: 'x' }] },
      'errors'
    );
    expect(found).toContain('shell-marking');
  });

  it('warns when requiresShell is set but unnecessary', () => {
    const found = checks({ ...base, requiresShell: true }, 'warnings');
    expect(found).toContain('shell-marking');
  });
});

describe('Doctor catches reference and content problems', () => {
  it('errors on a dangling relatedCommands id', () => {
    const found = checks({ ...base, relatedCommands: ['does.not.exist'] }, 'errors');
    expect(found).toContain('dangling-reference');
  });

  it('warns on a self-reference', () => {
    const report = runDoctor([{ ...base, relatedCommands: ['test.cmd'] }]);
    expect(report.warnings.map((f) => f.check)).toContain('self-reference');
  });

  it('warns when no example is concrete', () => {
    const found = checks(
      { ...base, examples: [{ command: 'demo <target>', explanation: 'x' }] },
      'warnings'
    );
    expect(found).toContain('example-concreteness');
  });

  it('warns when an entry has no aliases', () => {
    expect(checks({ ...base, aliases: [] }, 'warnings')).toContain('searchability');
  });

  it('warns when a deprecated entry names no replacement', () => {
    const found = checks(
      { ...base, verification: { ...base.verification, status: 'deprecated' } },
      'warnings'
    );
    expect(found).toContain('deprecation');
  });

  it('accepts sudo and companion-command examples without complaint', () => {
    const found = checks(
      {
        ...base,
        name: 'pushd',
        tags: ['pushd', 'popd'],
        commandTemplate: 'pushd <directory>',
        examples: [
          { command: 'pushd /tmp', explanation: 'x' },
          { command: 'popd', explanation: 'y' },
        ],
      },
      'warnings'
    );
    expect(found).not.toContain('example-mismatch');
  });

  it('passes a well-formed entry with no findings at all', () => {
    const report = runDoctor([base]);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.healthy).toBe(true);
  });
});

describe('The shipped knowledge base is healthy', () => {
  it('reports zero errors and zero warnings for bundled entries', () => {
    const loader = new KnowledgeBaseLoader();
    loader.loadFromDirectory(resolveKnowledgeDirectory());
    const report = runDoctor(loader.getAll());

    expect(
      report.errors.map((f) => `${f.entryId}: ${f.message}`),
      'bundled entries must have no doctor errors'
    ).toEqual([]);
    expect(
      report.warnings.map((f) => `${f.entryId}: ${f.message}`),
      'bundled entries must have no doctor warnings'
    ).toEqual([]);
  });
});
