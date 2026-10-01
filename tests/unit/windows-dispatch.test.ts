import { describe, it, expect } from 'vitest';
import { isWindowsBuiltin } from '../../src/execution/runner.js';
import { KnowledgeBaseLoader } from '../../src/knowledge-base/loader.js';
import { resolveKnowledgeDirectory } from '../../src/cli/index.js';
import { splitCommandArgs } from '../../src/safety/sanitizer.js';

/**
 * Regression guard for the ENOENT class of bug: a command that a native Windows
 * shell resolves itself (a CMD built-in, or a PowerShell alias/function) has no
 * .exe on disk. If it is missing from the dispatch tables, `spawn` with
 * `shell: false` fails with ENOENT.
 *
 * This went unnoticed during development because Git for Windows ships real
 * pwd.exe and mkdir.exe under usr/bin, which masks the failure locally.
 */

describe('Windows built-in dispatch tables', () => {
  it('covers both spellings of the directory built-ins', () => {
    // The original bug: 'md'/'rd' were present but 'mkdir'/'rmdir' were not.
    for (const name of ['md', 'mkdir', 'rd', 'rmdir']) {
      expect(isWindowsBuiltin(name), `${name} must be dispatched via an interpreter`).toBe(true);
    }
  });

  it('covers the POSIX-style names PowerShell provides as aliases', () => {
    // None of these exist as an executable on a clean Windows install.
    for (const name of ['pwd', 'ls', 'cat', 'cp', 'mv', 'rm', 'ps', 'kill', 'cd', 'clear']) {
      expect(isWindowsBuiltin(name), `${name} is a PowerShell alias with no .exe`).toBe(true);
    }
  });

  it('covers the classic CMD built-ins', () => {
    for (const name of ['dir', 'del', 'type', 'cls', 'copy', 'move', 'echo', 'ren']) {
      expect(isWindowsBuiltin(name)).toBe(true);
    }
  });

  it('is case-insensitive, matching Windows command resolution', () => {
    expect(isWindowsBuiltin('MKDIR')).toBe(true);
    expect(isWindowsBuiltin('Get-ChildItem')).toBe(true);
    expect(isWindowsBuiltin('PWD')).toBe(true);
  });

  it('does not claim real executables as built-ins', () => {
    // These ship as actual .exe files and must be spawned directly so their
    // own argument parsing applies.
    for (const name of ['git', 'node', 'npm', 'docker', 'python', 'java', 'tar', 'curl.exe']) {
      expect(isWindowsBuiltin(name), `${name} is a real executable`).toBe(false);
    }
  });
});

describe('Every bundled entry is dispatchable on Windows', () => {
  const loader = new KnowledgeBaseLoader();
  loader.loadFromDirectory(resolveKnowledgeDirectory());

  // Commands that genuinely ship as executables on Windows, or that are only
  // ever documented for POSIX platforms.
  const KNOWN_EXECUTABLES = new Set([
    'git', 'node', 'npm', 'npx', 'pnpm', 'yarn', 'docker', 'python', 'python3',
    'pip', 'java', 'javac', 'mvn', 'gradle', 'cargo', 'pytest', 'make', 'tar',
    'zip', 'unzip', 'gzip', 'curl', 'wget', 'ssh', 'scp', 'ping', 'netstat',
    'nslookup', 'ipconfig', 'where', 'findstr', 'tracert', 'traceroute', 'dig',
    'systemctl', 'service', 'journalctl', 'dmesg', 'apt', 'apt-get', 'brew',
    'chmod', 'chown', 'ln', 'du', 'df', 'find', 'grep', 'head', 'tail', 'less',
    'wc', 'touch', 'lsof', 'top', 'uname', 'uptime', 'which', 'ip', 'ifconfig',
    'export', 'set', 'env', 'pushd', 'popd', 'sudo',
  ]);

  it('routes every Windows-supported entry to a real binary or an interpreter', () => {
    const unroutable: string[] = [];

    for (const entry of loader.getAll()) {
      if (!entry.platforms.includes('windows')) continue;
      // Shell-dependent entries are refused before dispatch, so they cannot ENOENT.
      if (entry.requiresShell) continue;

      for (const example of entry.examples) {
        const argv = splitCommandArgs(example.command);
        const exe = (argv[0] ?? '').toLowerCase();
        if (!exe || exe.startsWith('$')) continue;

        const routable = isWindowsBuiltin(exe) || KNOWN_EXECUTABLES.has(exe);
        if (!routable) {
          unroutable.push(`${entry.id}: "${example.command}" -> ${exe}`);
        }
      }
    }

    expect(
      unroutable,
      'each of these would fail with spawn ENOENT on a clean Windows host'
    ).toEqual([]);
  });
});
