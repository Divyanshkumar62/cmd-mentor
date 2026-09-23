import fs from 'node:fs';
import path from 'node:path';
import { Platform, ShellType } from '../types/command.js';
import { getAppStorageDirectory } from './paths.js';

export interface AppConfig {
  execution: {
    enabled: boolean;
  };
  history: {
    enabled: boolean;
  };
  project: {
    /** Discover npm scripts / Make targets from the working directory. */
    enabled: boolean;
  };
  preferredPlatform?: Platform;
  preferredShell?: ShellType;
}

export const DEFAULT_CONFIG: AppConfig = {
  execution: {
    enabled: true,
  },
  history: {
    enabled: true,
  },
  project: {
    enabled: true,
  },
};

export class ConfigStore {
  private filePath: string;
  private config: AppConfig;

  constructor(customPath?: string) {
    this.filePath = customPath || path.join(getAppStorageDirectory(), 'config.json');
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          execution: {
            ...DEFAULT_CONFIG.execution,
            ...(parsed.execution || {}),
          },
          history: {
            ...DEFAULT_CONFIG.history,
            ...(parsed.history || {}),
          },
          project: {
            ...DEFAULT_CONFIG.project,
            ...(parsed.project || {}),
          },
        };
      }
    } catch {
      // Fallback to default on parse error
    }
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.config, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error(`Failed to save config to ${this.filePath}:`, err);
    }
  }

  public get(): AppConfig {
    return { ...this.config };
  }

  public set(keyPath: string, value: unknown): void {
    if (keyPath === 'execution.enabled') {
      this.config.execution.enabled = Boolean(value);
    } else if (keyPath === 'history.enabled') {
      this.config.history.enabled = Boolean(value);
    } else if (keyPath === 'project.enabled') {
      this.config.project.enabled = Boolean(value);
    } else if (keyPath === 'preferredPlatform') {
      this.config.preferredPlatform = value as Platform;
    } else if (keyPath === 'preferredShell') {
      this.config.preferredShell = value as ShellType;
    }
    this.save();
  }
}
