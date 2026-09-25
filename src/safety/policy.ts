import { CommandEntry, SafetyLevel } from '../types/command.js';
import { ExecutionPolicy } from '../types/safety.js';

export function getExecutionPolicy(entry: CommandEntry): ExecutionPolicy {
  const level: SafetyLevel = entry.risk.level;

  let canExecute = true;
  let requiresExplicitConfirmation = true;
  let requiresStrictUppercaseConfirm = false;
  let warningNotice: string | undefined;

  switch (level) {
    case 'informational':
      requiresStrictUppercaseConfirm = false;
      break;

    case 'low':
      requiresStrictUppercaseConfirm = false;
      break;

    case 'moderate':
      requiresStrictUppercaseConfirm = false;
      if (entry.risk.destructive) {
        warningNotice = 'NOTICE: This command will modify files or processes.';
      }
      break;

    case 'high':
      requiresStrictUppercaseConfirm = true;
      warningNotice = 'WARNING: HIGH-RISK / DESTRUCTIVE OPERATION. Irreversible or extensive changes.';
      break;

    case 'restricted':
      canExecute = false;
      requiresExplicitConfirmation = false;
      warningNotice = 'EXECUTION BLOCKED: This command is classified as restricted and cannot be executed through CmdMentor.';
      break;
  }

  if (entry.risk.requiresElevation) {
    const elevationNotice = 'REQUIRES ELEVATION: Administrator or Root privileges may be necessary.';
    warningNotice = warningNotice ? `${warningNotice} ${elevationNotice}` : elevationNotice;
  }

  return {
    level,
    canExecute,
    requiresExplicitConfirmation,
    requiresStrictUppercaseConfirm,
    warningNotice,
  };
}
