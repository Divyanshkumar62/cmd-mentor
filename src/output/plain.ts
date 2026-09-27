import { CommandEntry } from '../types/command.js';
import { KnowledgeBaseStats } from '../knowledge-base/loader.js';
import { ValidationReport } from '../knowledge-base/validator.js';
import { HistoryEntry } from '../storage/history.js';

/** Where an entry came from, so unreviewed content is never mistaken for reviewed. */
export function describeSource(entry: CommandEntry): 'bundled' | 'project' | 'custom' {
  if (entry.id.startsWith('project.')) return 'project';
  if (entry.category.includes('custom')) return 'custom';
  return 'bundled';
}

export function formatPlainSearchResults(entries: CommandEntry[]): string {
  if (entries.length === 0) {
    return 'No matching commands found in local knowledge base.';
  }

  const lines: string[] = [];
  const rule = '-'.repeat(90);
  lines.push(rule);
  lines.push(
    `${'COMMAND'.padEnd(16)} | ${'TITLE'.padEnd(30)} | ${'SHELLS'.padEnd(18)} | ${'RISK'.padEnd(13)} | SOURCE`
  );
  lines.push(rule);

  let unreviewed = 0;
  for (const entry of entries) {
    const name = entry.name.length > 15 ? entry.name.slice(0, 12) + '...' : entry.name;
    const title = entry.title.length > 29 ? entry.title.slice(0, 26) + '...' : entry.title;
    const shells = entry.shells.slice(0, 3).join(',');
    const shellDisplay = entry.shells.length > 3 ? `${shells}...` : shells;
    const source = describeSource(entry);
    if (source !== 'bundled') unreviewed++;
    lines.push(
      `${name.padEnd(16)} | ${title.padEnd(30)} | ${shellDisplay.padEnd(18)} | ${entry.risk.level.toUpperCase().padEnd(13)} | ${source}`
    );
  }

  lines.push(rule);
  lines.push(`Found ${entries.length} result(s). Use 'cmdmentor show <id> --plain' for full details.`);
  if (unreviewed > 0) {
    lines.push(
      `Note: ${unreviewed} result(s) come from this project or your custom entries and are not reviewed by CmdMentor.`
    );
  }
  return lines.join('\n');
}

export function formatPlainDetail(entry: CommandEntry): string {
  const lines: string[] = [];
  lines.push('================================================================================');
  lines.push(`Command: ${entry.name} (${entry.id})`);
  lines.push(`Title:   ${entry.title}`);
  lines.push('================================================================================');
  lines.push(`\nDescription:\n  ${entry.description}\n`);
  lines.push(`Template:\n  ${entry.commandTemplate}\n`);
  lines.push(`Platforms: ${entry.platforms.join(', ')}`);
  lines.push(`Shells:    ${entry.shells.join(', ')}`);
  lines.push(`Category:  ${entry.category.join(', ')}`);
  lines.push(`Aliases:   ${entry.aliases.join('; ')}\n`);

  if (entry.flags && entry.flags.length > 0) {
    lines.push('Flags:');
    for (const flag of entry.flags) {
      const shorthand = flag.shorthand ? ` (${flag.shorthand})` : '';
      lines.push(`  ${flag.name}${shorthand}: ${flag.description}`);
    }
    lines.push('');
  }

  if (entry.examples && entry.examples.length > 0) {
    lines.push('Examples:');
    for (let i = 0; i < entry.examples.length; i++) {
      const ex = entry.examples[i];
      if (ex) {
        lines.push(`  ${i + 1}. ${ex.command}`);
        lines.push(`     -> ${ex.explanation}`);
      }
    }
    lines.push('');
  }

  lines.push('Safety & Execution:');
  lines.push(`  Risk Level:         ${entry.risk.level.toUpperCase()}`);
  lines.push(`  Destructive:        ${entry.risk.destructive ? 'YES (Data modification)' : 'NO'}`);
  lines.push(`  Requires Elevation: ${entry.risk.requiresElevation ? 'YES (Admin/Root)' : 'NO'}`);
  if (entry.risk.sideEffects) {
    lines.push(`  Side Effects:       ${entry.risk.sideEffects}`);
  }
  if (entry.risk.reversibility) {
    lines.push(`  Reversibility:      ${entry.risk.reversibility}`);
  }
  lines.push('');

  lines.push('Verification Audit:');
  const source = describeSource(entry);
  if (source !== 'bundled') {
    lines.push(
      source === 'project'
        ? '  Provenance:    DISCOVERED IN THIS PROJECT - not reviewed by CmdMentor.'
        : '  Provenance:    YOUR CUSTOM ENTRY - not reviewed by CmdMentor.'
    );
  }
  lines.push(`  Status:        ${entry.verification.status}`);
  if (source === 'bundled') {
    lines.push(`  Last Reviewed: ${entry.verification.lastReviewed}`);
  }
  lines.push(`  Source:        ${entry.verification.source}`);

  if (entry.relatedCommands && entry.relatedCommands.length > 0) {
    lines.push(`\nRelated Commands: ${entry.relatedCommands.join(', ')}`);
  }

  return lines.join('\n');
}

export function formatPlainStats(stats: KnowledgeBaseStats): string {
  const lines: string[] = [];
  lines.push('================================================================================');
  lines.push('CmdMentor Knowledge Base Statistics');
  lines.push('================================================================================');
  lines.push(`Schema Version:  ${stats.schemaVersion}`);
  lines.push(`Content Version: ${stats.contentVersion}`);
  lines.push(`Total Commands:  ${stats.count}`);
  lines.push(`Platforms:       ${stats.platforms.join(', ')}`);
  lines.push(`Categories:      ${stats.categories.join(', ')}`);
  return lines.join('\n');
}

export function formatPlainValidation(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push('================================================================================');
  lines.push('CmdMentor Knowledge Base Validation Report');
  lines.push('================================================================================');
  lines.push(`Status:          ${report.valid ? 'PASSED (100% Valid)' : 'FAILED'}`);
  lines.push(`Total Checked:   ${report.totalEntries}`);
  lines.push(`Valid Entries:   ${report.validEntries}`);
  lines.push(`Invalid Entries: ${report.invalidEntries}`);

  if (report.duplicateIds.length > 0) {
    lines.push('\nDuplicate IDs Found:');
    for (const dup of report.duplicateIds) {
      lines.push(`  - ${dup}`);
    }
  }

  if (report.errors.length > 0) {
    lines.push('\nValidation Errors:');
    for (const err of report.errors) {
      lines.push(`  - [${err.id || 'unknown'}]: ${err.errors.join('; ')}`);
    }
  }

  return lines.join('\n');
}

export function formatPlainHistory(entries: HistoryEntry[]): string {
  const lines: string[] = [];
  lines.push('--------------------------------------------------------------------------------');
  lines.push(`${'WHEN'.padEnd(22)} | ${'TYPE'.padEnd(8)} | QUERY`);
  lines.push('--------------------------------------------------------------------------------');

  for (const entry of entries) {
    const when = entry.timestamp.replace('T', ' ').slice(0, 19);
    lines.push(`${when.padEnd(22)} | ${entry.type.padEnd(8)} | ${entry.query}`);
  }

  lines.push('--------------------------------------------------------------------------------');
  lines.push(`${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}. Clear with 'cmdmentor history clear'.`);
  return lines.join('\n');
}
