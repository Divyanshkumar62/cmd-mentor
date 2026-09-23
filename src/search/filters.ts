import { CommandEntry, Platform, SafetyLevel, ShellType } from '../types/command.js';

export interface FilterOptions {
  platform?: Platform;
  shell?: ShellType;
  category?: string;
  riskLevel?: SafetyLevel;
  preferredPlatform?: Platform;
  preferredShell?: ShellType;
}

export function filterEntries(entries: CommandEntry[], filters: FilterOptions): CommandEntry[] {
  return entries.filter((entry) => {
    if (filters.platform && !entry.platforms.includes(filters.platform)) {
      return false;
    }
    if (filters.shell && !entry.shells.includes(filters.shell)) {
      return false;
    }
    if (filters.category && !entry.category.includes(filters.category)) {
      return false;
    }
    if (filters.riskLevel && entry.risk.level !== filters.riskLevel) {
      return false;
    }
    return true;
  });
}

export function calculateCompatibilityBoost(entry: CommandEntry, preferredPlatform?: Platform, preferredShell?: ShellType): number {
  let boost = 0;
  if (preferredPlatform && entry.platforms.includes(preferredPlatform)) {
    boost += 30;
  }
  if (preferredShell && entry.shells.includes(preferredShell)) {
    boost += 20;
  }
  return boost;
}
