import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export function getAppStorageDirectory(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'CmdMentor');
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'CmdMentor');
  }

  // Linux / BSD
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdgConfig, 'cmdmentor');
}

export function getCustomSnippetsDirectory(): string {
  return path.join(os.homedir(), '.cmdmentor', 'custom');
}
