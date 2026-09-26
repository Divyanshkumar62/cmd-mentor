import { spawn } from 'node:child_process';
import process from 'node:process';
import { splitCommandArgs } from '../safety/sanitizer.js';
import { assessExecutability } from '../safety/shell-requirement.js';
import { Platform, ShellType } from '../types/command.js';

export interface ExecutionOptions {
  commandLine: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  executionEnabled?: boolean;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  timeoutMs?: number;
  platform?: Platform;
  /** Detected shell; decides whether interpreter dispatch is needed. */
  shellType?: ShellType;
}

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Windows shell built-ins have no standalone executable, so `spawn` cannot run
 * them directly. They are dispatched through the interpreter with the command
 * name and its arguments passed as a STRUCTURED argv array - never as a raw
 * concatenated string. Commands needing real shell evaluation are rejected
 * upstream by `assessExecutability`, so nothing reaching here contains
 * metacharacters.
 */
const WINDOWS_CMD_BUILTINS = new Set([
  'dir', 'del', 'erase', 'type', 'cls', 'copy', 'move',
  // Both spellings are CMD built-ins; shipping only 'md'/'rd' made the POSIX
  // spellings fall through to a PATH lookup for a non-existent mkdir.exe.
  'md', 'mkdir', 'rd', 'rmdir',
  'cd', 'chdir', 'ren', 'rename', 'echo', 'findstr', 'find',
  'where', 'tree', 'set', 'path', 'ver', 'vol', 'date', 'time',
  'assoc', 'ftype', 'title', 'pushd', 'popd',
]);

/**
 * Names the PowerShell host resolves itself - cmdlets, functions, and the
 * POSIX-style aliases it defines (`pwd`, `ls`, `cat`, `rm`, ...). None of these
 * exist as an .exe on a standard Windows install, so spawning them directly
 * fails with ENOENT. They must be dispatched through powershell.exe.
 *
 * Note: Git for Windows ships real pwd.exe/mkdir.exe under its usr/bin, which
 * masks this on developer machines running Git Bash. The list below is what a
 * clean PowerShell or CMD host actually provides.
 */
const POWERSHELL_BUILTINS = new Set([
  // Cmdlets
  'get-childitem', 'new-item', 'remove-item', 'copy-item', 'move-item',
  'rename-item', 'get-content', 'set-content', 'add-content', 'clear-content',
  'get-process', 'stop-process', 'start-process',
  'get-service', 'restart-service', 'start-service', 'stop-service',
  'test-netconnection', 'select-string', 'get-location', 'set-location',
  'push-location', 'pop-location', 'measure-object', 'select-object',
  'sort-object', 'where-object', 'foreach-object', 'tee-object',
  'get-command', 'get-help', 'get-member', 'write-output', 'write-host',
  'get-winevent', 'get-eventlog', 'test-path', 'resolve-path',
  'get-item', 'set-item', 'invoke-webrequest', 'invoke-restmethod',
  'compress-archive', 'expand-archive', 'get-date', 'start-sleep',
  'clear-host', 'get-history', 'convertto-json', 'convertfrom-json',
  // POSIX-style aliases and functions defined by the PowerShell host
  'pwd', 'ls', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'cd', 'chdir',
  'ps', 'kill', 'clear', 'man', 'sleep', 'sort', 'tee', 'echo', 'write',
  'type', 'del', 'dir', 'md', 'rd', 'ren', 'copy', 'move', 'history',
  'gc', 'gci', 'gcm', 'gi', 'gl', 'gm', 'gp', 'gps', 'sl', 'si', 'sp',
  'ni', 'ri', 'ci', 'mi', 'rni', 'sls', 'select', 'where', 'foreach',
  'cls', 'curl', 'wget', 'iwr', 'irm',
]);

export function isWindowsBuiltin(executable: string): boolean {
  const lower = executable.toLowerCase();
  return WINDOWS_CMD_BUILTINS.has(lower) || POWERSHELL_BUILTINS.has(lower);
}

export async function executeCommand(options: ExecutionOptions): Promise<ExecutionResult> {
  const executionEnabled = options.executionEnabled ?? true;
  if (!executionEnabled) {
    throw new Error('Execution Error: Command execution is globally disabled via configuration kill-switch.');
  }

  // Root-cause gate: every execution path funnels through here, so a command
  // needing shell evaluation can never be silently mangled or string-eval'd.
  const executability = assessExecutability(options.commandLine);
  if (!executability.executable) {
    throw new Error(`Execution Error: ${executability.detail}`);
  }

  const rawArgs = splitCommandArgs(options.commandLine);
  if (rawArgs.length === 0) {
    throw new Error('Execution Error: No executable command specified.');
  }

  const executable = rawArgs[0]!;
  const args = rawArgs.slice(1);

  const startTime = Date.now();
  let stdoutAccumulator = '';
  let stderrAccumulator = '';

  return new Promise((resolve, reject) => {
    let spawnExecutable = executable;
    let spawnArgs = args;
    const isWindows =
      (options.platform || (process.platform === 'win32' ? 'windows' : 'linux')) === 'windows';
    const exeLower = executable.toLowerCase();

    // Dispatch is shell-aware. Git Bash and WSL provide real POSIX binaries
    // (mkdir.exe, pwd.exe) that accept POSIX flags, so routing `mkdir -p a/b`
    // through PowerShell there would break it. Only the native Windows shells
    // need interpreter dispatch.
    const shell = options.shellType ?? (isWindows ? 'powershell' : 'bash');
    const needsInterpreter = isWindows && (shell === 'powershell' || shell === 'cmd');

    if (needsInterpreter && shell === 'cmd' && WINDOWS_CMD_BUILTINS.has(exeLower)) {
      spawnExecutable = process.env.ComSpec || 'cmd.exe';
      spawnArgs = ['/d', '/s', '/c', executable, ...args];
    } else if (needsInterpreter && POWERSHELL_BUILTINS.has(exeLower)) {
      // Structured argv: the cmdlet name is a single argument, never interpolated.
      spawnExecutable = 'powershell.exe';
      spawnArgs = ['-NoProfile', '-NonInteractive', '-Command', executable, ...args];
    } else if (needsInterpreter && WINDOWS_CMD_BUILTINS.has(exeLower)) {
      // Known to CMD but not to PowerShell (e.g. `ver`, `assoc`).
      spawnExecutable = process.env.ComSpec || 'cmd.exe';
      spawnArgs = ['/d', '/s', '/c', executable, ...args];
    }

    const child = spawn(spawnExecutable, spawnArgs, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let timeoutTimer: NodeJS.Timeout | undefined;
    if (options.timeoutMs && options.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 2000);
        reject(new Error(`Execution timed out after ${options.timeoutMs}ms.`));
      }, options.timeoutMs);
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stdoutAccumulator += text;
      if (options.onStdout) {
        options.onStdout(text);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stderrAccumulator += text;
      if (options.onStderr) {
        options.onStderr(text);
      }
    });

    child.on('error', (err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      reject(err);
    });

    child.on('close', (code) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      const durationMs = Date.now() - startTime;
      resolve({
        exitCode: code ?? 1,
        stdout: stdoutAccumulator,
        stderr: stderrAccumulator,
        durationMs,
      });
    });
  });
}
