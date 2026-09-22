import { Platform, ShellType } from './command.js';

export interface TerminalCapabilities {
  isTTY: boolean;
  columns: number;
  rows: number;
  colorDepth: number;
  hasUnicode: boolean;
}

export interface EnvironmentContext {
  platform: Platform;
  shell: ShellType;
  cwd: string;
  terminal: TerminalCapabilities;
  isAmbiguousShell: boolean;
  rawPlatform: NodeJS.Platform;
}
