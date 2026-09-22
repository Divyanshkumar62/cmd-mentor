import { SafetyLevel } from './command.js';

export interface ExecutionPolicy {
  level: SafetyLevel;
  requiresExplicitConfirmation: boolean;
  requiresStrictUppercaseConfirm: boolean;
  canExecute: boolean;
  warningNotice?: string;
}
