import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  scanProject,
  parseMakeTargets,
  parseComposeServices,
  detectPackageManager,
  findProjectRoot,
} from '../../src/knowledge-base/project-scanner.js';
import { CommandEntrySchema } from '../../src/knowledge-base/schema.js';

let tmp: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdmentor-proj-'));
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({
      name: 'demo',
      scripts: { build: 'tsup', test: 'vitest run', start: 'node .', lint: 'eslint .' },
    })
  );
  fs.writeFileSync(
    path.join(tmp, 'Makefile'),
    [
      '.PHONY: all',
      'CFLAGS := -O2',
      'all: build test',
      '\t@echo done',
      'build:',
      '\tgcc -o app main.c',
      '%.o: %.c',
      '\tgcc -c $<',
      '# a comment',
      'deploy: build',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(tmp, 'compose.yaml'),
    [
      'version: "3"',
      'services:',
      '  api:',
      '    image: node',
      '    ports:',
      '      - 3000',
      '  db:',
      '    image: postgres',
      'volumes:',
      '  pgdata:',
    ].join('\n')
  );
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Makefile target parsing', () => {
  it('extracts real targets and skips noise', () => {
    const targets = parseMakeTargets(fs.readFileSync(path.join(tmp, 'Makefile'), 'utf-8'));
    expect(targets).toEqual(['all', 'build', 'deploy']);
  });

  it('ignores variable assignments, recipes, and pattern rules', () => {
    expect(parseMakeTargets('VAR := x')).toEqual([]);
    expect(parseMakeTargets('\tindented: not-a-target')).toEqual([]);
    expect(parseMakeTargets('%.o: %.c')).toEqual([]);
    expect(parseMakeTargets('.PHONY: all')).toEqual([]);
  });
});

describe('Compose service parsing', () => {
  it('extracts service names from the services block only', () => {
    const services = parseComposeServices(fs.readFileSync(path.join(tmp, 'compose.yaml'), 'utf-8'));
    expect(services).toEqual(['api', 'db']);
  });

  it('does not pick up nested keys or later top-level blocks', () => {
    expect(parseComposeServices('services:\n  web:\n    image: x\nnetworks:\n  default:\n')).toEqual([
      'web',
    ]);
  });

  it('returns nothing when there is no services block', () => {
    expect(parseComposeServices('version: "3"\nvolumes:\n  a:\n')).toEqual([]);
  });
});

describe('Package manager detection', () => {
  it('defaults to npm without a lockfile', () => {
    expect(detectPackageManager(tmp)).toBe('npm');
  });

  it('detects pnpm and yarn from their lockfiles', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdmentor-pm-'));
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(dir)).toBe('pnpm');
    fs.rmSync(dir, { recursive: true, force: true });

    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdmentor-pm2-'));
    fs.writeFileSync(path.join(dir2, 'yarn.lock'), '');
    expect(detectPackageManager(dir2)).toBe('yarn');
    fs.rmSync(dir2, { recursive: true, force: true });
  });
});

describe('Project scan', () => {
  it('discovers scripts, targets, and services together', () => {
    const result = scanProject(tmp);
    const ids = result.entries.map((e) => e.id);

    expect(result.projectRoot).toBe(fs.realpathSync(tmp));
    expect(ids).toContain('project.script.build');
    expect(ids).toContain('project.make.deploy');
    expect(ids).toContain('project.compose.api');
  });

  it('emits entries that satisfy the knowledge base schema', () => {
    for (const entry of scanProject(tmp).entries) {
      const parsed = CommandEntrySchema.safeParse(entry);
      expect(parsed.success, `${entry.id}: ${JSON.stringify(parsed.error?.errors)}`).toBe(true);
    }
  });

  it('uses npm shorthand for test and start, run for everything else', () => {
    const byId = new Map(scanProject(tmp).entries.map((e) => [e.id, e]));
    expect(byId.get('project.script.test')?.commandTemplate).toBe('npm test');
    expect(byId.get('project.script.start')?.commandTemplate).toBe('npm start');
    expect(byId.get('project.script.build')?.commandTemplate).toBe('npm run build');
  });

  it('marks discovered entries as pending review, never as verified', () => {
    for (const entry of scanProject(tmp).entries) {
      expect(entry.verification.status).toBe('pending');
    }
  });

  it('returns an empty result for a directory with no project markers', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdmentor-empty-'));
    const result = scanProject(empty);
    expect(result.entries).toEqual([]);
    fs.rmSync(empty, { recursive: true, force: true });
  });

  it('survives a malformed package.json without throwing', () => {
    const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdmentor-broken-'));
    fs.writeFileSync(path.join(broken, 'package.json'), '{ not valid json');
    expect(() => scanProject(broken)).not.toThrow();
    expect(scanProject(broken).entries).toEqual([]);
    fs.rmSync(broken, { recursive: true, force: true });
  });

  it('finds the project root from a nested subdirectory', () => {
    const nested = path.join(tmp, 'src', 'deep');
    fs.mkdirSync(nested, { recursive: true });
    expect(findProjectRoot(nested)).toBe(fs.realpathSync(tmp));
  });
});
