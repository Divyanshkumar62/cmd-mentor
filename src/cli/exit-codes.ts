export const EXIT_CODES = {
  SUCCESS: 0,
  NOT_FOUND: 1,
  USAGE_ERROR: 2,
  TTY_REQUIRED: 3,
  CANCELED: 4,
  EXEC_FAILED: 5,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
