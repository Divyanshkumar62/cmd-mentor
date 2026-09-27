import process from 'node:process';
import { Platform, ShellType } from '../types/command.js';
import { EnvironmentContext, TerminalCapabilities } from '../types/environment.js';

export interface DetectOptions {
  mockEnv?: NodeJS.ProcessEnv;
  mockPlatform?: NodeJS.Platform;
  mockCwd?: string;
  mockIsTTY?: boolean;
  overridePlatform?: Platform;
  overrideShell?: ShellType;
}

export function resolvePlatformFromNode(nodePlatform: NodeJS.Platform): Platform {
  switch (nodePlatform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    case 'linux':
    default:
      return 'linux';
  }
}

export function detectShell(env: NodeJS.ProcessEnv, platform: Platform): { shell: ShellType; isAmbiguous: boolean } {
  const shellEnv = (env.SHELL || '').toLowerCase();
  const msystem = env.MSYSTEM || '';

  if (platform === 'windows') {
    if (msystem || shellEnv.includes('bash')) {
      return { shell: 'git-bash', isAmbiguous: false };
    }
    if (env.PWSH || env.PSModulePath || env.WT_SESSION) {
      return { shell: 'powershell', isAmbiguous: false };
    }
    if (env.ComSpec && !env.PSModulePath) {
      return { shell: 'cmd', isAmbiguous: false };
    }
    return { shell: 'powershell', isAmbiguous: true };
  }

  // POSIX (Linux / macOS)
  if (shellEnv.includes('zsh')) {
    return { shell: 'zsh', isAmbiguous: false };
  }
  if (shellEnv.includes('fish')) {
    return { shell: 'fish', isAmbiguous: false };
  }
  if (shellEnv.includes('bash')) {
    return { shell: 'bash', isAmbiguous: false };
  }

  // Default fallback for POSIX
  return { shell: platform === 'macos' ? 'zsh' : 'bash', isAmbiguous: true };
}

export function detectTerminalCapabilities(isTTYOverride?: boolean): TerminalCapabilities {
  const isTTY = isTTYOverride !== undefined ? isTTYOverride : Boolean(process.stdout.isTTY);
  const columns = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  const colorDepth = process.stdout.getColorDepth ? process.stdout.getColorDepth() : 8;
  const hasUnicode = process.platform !== 'win32' || Boolean(process.env.WT_SESSION) || process.env.TERM_PROGRAM === 'vscode';

  return {
    isTTY,
    columns,
    rows,
    colorDepth,
    hasUnicode,
  };
}

export function detectEnvironment(options: DetectOptions = {}): EnvironmentContext {
  const rawPlatform = options.mockPlatform || process.platform;
  const resolvedPlatform = resolvePlatformFromNode(rawPlatform);
  const platform = options.overridePlatform || resolvedPlatform;

  const env = options.mockEnv || process.env;
  const detected = detectShell(env, platform);
  const shell = options.overrideShell || detected.shell;

  const cwd = options.mockCwd || (typeof process.cwd === 'function' ? process.cwd() : '.');
  const terminal = detectTerminalCapabilities(options.mockIsTTY);

  return {
    platform,
    shell,
    cwd,
    terminal,
    isAmbiguousShell: options.overrideShell ? false : detected.isAmbiguous,
    rawPlatform,
  };
}
