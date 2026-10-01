import { CommandEntry } from '../types/command.js';
import { requiresShellEvaluation } from '../safety/shell-requirement.js';
import { extractPlaceholders } from '../safety/sanitizer.js';

/**
 * Content-quality checks that a schema cannot express. The Zod schema proves an
 * entry is well-formed; these checks probe whether it is *correct* - risk that
 * matches behaviour, references that resolve, examples that match their own
 * template, and shell dependence that is declared.
 */

export type DoctorSeverity = 'error' | 'warning';

export interface DoctorFinding {
  severity: DoctorSeverity;
  entryId: string;
  check: string;
  message: string;
}

export interface DoctorReport {
  healthy: boolean;
  totalEntries: number;
  errors: DoctorFinding[];
  warnings: DoctorFinding[];
}

/** Commands whose presence implies the entry really is destructive. */
const DESTRUCTIVE_SIGNALS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-\w*[rf]|--recursive|--force)/, reason: 'recursive or forced deletion' },
  { pattern: /\bmkfs\b|\bdd\s+if=/, reason: 'filesystem or raw device write' },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: 'discards committed and working tree state' },
  { pattern: /\bgit\s+push\s+.*--force(?!-with-lease)/, reason: 'can overwrite remote history' },
  { pattern: /\bdrop\s+(database|table)\b/i, reason: 'drops a database object' },
  { pattern: /\bchmod\s+(-R\s+)?777\b/, reason: 'grants world-writable permissions' },
];

/** Signals that an entry almost certainly needs administrator or root rights. */
const ELEVATION_SIGNALS = /^\s*(sudo|doas)\b|\bsystemctl\s+(start|stop|restart|enable|disable)\b|\bapt(-get)?\s+(install|remove|purge)\b/;

function add(
  list: DoctorFinding[],
  severity: DoctorSeverity,
  entryId: string,
  check: string,
  message: string
): void {
  list.push({ severity, entryId, check, message });
}

export function runDoctor(entries: CommandEntry[]): DoctorReport {
  const errors: DoctorFinding[] = [];
  const warnings: DoctorFinding[] = [];
  const knownIds = new Set(entries.map((e) => e.id));

  for (const entry of entries) {
    const commands = entry.examples.map((e) => e.command);

    // 1. Shell dependence must be declared, or execution silently misbehaves.
    const shellNeeded = commands.some((c) => requiresShellEvaluation(c));
    if (shellNeeded && !entry.requiresShell) {
      add(errors, 'error', entry.id, 'shell-marking',
        'Examples need shell evaluation but the entry is not marked requiresShell.');
    }
    if (!shellNeeded && entry.requiresShell) {
      add(warnings, 'warning', entry.id, 'shell-marking',
        'Marked requiresShell but no example actually needs a shell; execution is blocked unnecessarily.');
    }

    // 2. Risk classification must match observable behaviour.
    for (const { pattern, reason } of DESTRUCTIVE_SIGNALS) {
      const hit = commands.find((c) => pattern.test(c)) ?? (pattern.test(entry.commandTemplate) ? entry.commandTemplate : undefined);
      if (!hit) continue;
      if (!entry.risk.destructive) {
        add(errors, 'error', entry.id, 'risk-destructive',
          `Command performs ${reason} but risk.destructive is false: "${hit}"`);
      }
      if (entry.risk.level !== 'high' && entry.risk.level !== 'restricted') {
        add(errors, 'error', entry.id, 'risk-level',
          `Command performs ${reason} but is classified "${entry.risk.level}": "${hit}"`);
      }
    }

    if (entry.risk.destructive && (entry.risk.level === 'informational' || entry.risk.level === 'low')) {
      add(errors, 'error', entry.id, 'risk-level',
        `Marked destructive but classified "${entry.risk.level}"; expected moderate or higher.`);
    }

    const needsElevation =
      ELEVATION_SIGNALS.test(entry.commandTemplate) || commands.some((c) => ELEVATION_SIGNALS.test(c));
    if (needsElevation && !entry.risk.requiresElevation) {
      add(warnings, 'warning', entry.id, 'risk-elevation',
        'Command typically requires administrator or root rights but requiresElevation is false.');
    }

    // 3. Destructive entries owe the user an explanation of consequences.
    if (entry.risk.destructive && !entry.risk.reversibility) {
      add(warnings, 'warning', entry.id, 'risk-documentation',
        'Destructive command does not document its reversibility.');
    }
    if (entry.risk.level === 'high' && !entry.risk.sideEffects) {
      add(warnings, 'warning', entry.id, 'risk-documentation',
        'High-risk command does not document its side effects.');
    }

    // 4. Cross-references must resolve.
    for (const related of entry.relatedCommands ?? []) {
      if (!knownIds.has(related)) {
        add(errors, 'error', entry.id, 'dangling-reference',
          `relatedCommands points at unknown id "${related}".`);
      }
      if (related === entry.id) {
        add(warnings, 'warning', entry.id, 'self-reference',
          'relatedCommands includes the entry itself.');
      }
    }

    // 5. Examples should exercise the command the entry claims to document.
    // Privilege prefixes and documented companion commands (popd for pushd) are
    // legitimate, so only a genuinely unrelated verb is worth flagging.
    const baseName = entry.name.split(/\s+/)[0]!.toLowerCase();
    const acceptableVerbs = new Set<string>([
      baseName,
      ...entry.tags.map((t) => t.toLowerCase()),
    ]);
    for (const example of entry.examples) {
      const tokens = example.command.trim().split(/\s+/).map((t) => t.toLowerCase());
      // Skip privilege prefixes to find the real verb.
      let verb = tokens[0] ?? '';
      if (verb === 'sudo' || verb === 'doas') {
        verb = tokens[1] ?? verb;
      }
      // PowerShell variable assignment (`$env:X = ...`) legitimately has no verb.
      if (verb.startsWith('$')) continue;
      if (!acceptableVerbs.has(verb)) {
        add(warnings, 'warning', entry.id, 'example-mismatch',
          `Example starts with "${verb}" but the entry documents "${baseName}": "${example.command}"`);
      }
    }

    // 6. A template placeholder that no example demonstrates is hard to learn from.
    const placeholders = extractPlaceholders(entry.commandTemplate);
    if (placeholders.length > 0 && entry.examples.every((e) => extractPlaceholders(e.command).length > 0)) {
      add(warnings, 'warning', entry.id, 'example-concreteness',
        'Every example still contains placeholders; at least one concrete example is expected.');
    }

    // 7. Searchability.
    if (entry.aliases.length === 0) {
      add(warnings, 'warning', entry.id, 'searchability',
        'No natural-language aliases; plain-English search is unlikely to find this entry.');
    }

    // 8. Deprecated entries must say what replaces them.
    if (entry.verification.status === 'deprecated' && !entry.deprecation?.replacedBy) {
      add(warnings, 'warning', entry.id, 'deprecation',
        'Marked deprecated but does not name a replacement.');
    }
  }

  return {
    healthy: errors.length === 0,
    totalEntries: entries.length,
    errors,
    warnings,
  };
}

export function formatDoctorReport(report: DoctorReport, verbose = false): string {
  const lines: string[] = [];
  const rule = '='.repeat(80);
  lines.push(rule);
  lines.push('CmdMentor Knowledge Base Health Report');
  lines.push(rule);
  lines.push(`Entries checked: ${report.totalEntries}`);
  lines.push(`Errors:          ${report.errors.length}`);
  lines.push(`Warnings:        ${report.warnings.length}`);
  lines.push(`Status:          ${report.healthy ? 'HEALTHY' : 'NEEDS ATTENTION'}`);

  if (report.errors.length > 0) {
    lines.push('', 'Errors (these break correctness or safety):');
    for (const f of report.errors) {
      lines.push(`  [${f.check}] ${f.entryId}`);
      lines.push(`      ${f.message}`);
    }
  }

  if (report.warnings.length > 0) {
    if (verbose) {
      lines.push('', 'Warnings (content quality):');
      for (const f of report.warnings) {
        lines.push(`  [${f.check}] ${f.entryId}`);
        lines.push(`      ${f.message}`);
      }
    } else {
      const byCheck = new Map<string, number>();
      for (const f of report.warnings) {
        byCheck.set(f.check, (byCheck.get(f.check) ?? 0) + 1);
      }
      lines.push('', 'Warnings by category (re-run with --verbose for detail):');
      for (const [check, count] of [...byCheck.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${String(count).padStart(4)}  ${check}`);
      }
    }
  }

  return lines.join('\n');
}
