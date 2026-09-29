import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { CommandEntry, SafetyLevel } from '../../types/command.js';
import { generateExecutionPreview } from '../../execution/preview.js';
import { executeCommand, ExecutionResult } from '../../execution/runner.js';
import { buildPrompts } from '../../execution/placeholders.js';
import { sanitizeParameter } from '../../safety/sanitizer.js';
import { EnvironmentContext } from '../../types/environment.js';

interface ExecutionModalProps {
  entry: CommandEntry;
  environment: EnvironmentContext;
  onBack: () => void;
  onDisableExecution?: () => void;
}

function getRiskBadgeColor(level: SafetyLevel): string {
  switch (level) {
    case 'informational':
      return 'blue';
    case 'low':
      return 'green';
    case 'moderate':
      return 'yellow';
    case 'high':
    case 'restricted':
      return 'red';
    default:
      return 'white';
  }
}

export const ExecutionModal: React.FC<ExecutionModalProps> = ({
  entry,
  environment,
  onBack,
  onDisableExecution,
}) => {
  // Values collected for template placeholders, filled in before confirmation.
  const [params, setParams] = useState<Record<string, string>>({});
  const [fillIndex, setFillIndex] = useState(0);
  const [fillBuffer, setFillBuffer] = useState('');
  const [fillError, setFillError] = useState<string | null>(null);

  const [inputBuffer, setInputBuffer] = useState('');
  const [executionState, setExecutionState] = useState<'PROMPT' | 'RUNNING' | 'DONE'>('PROMPT');
  const [outputStream, setOutputStream] = useState<string>('');
  const [execResult, setExecResult] = useState<ExecutionResult | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      generateExecutionPreview(entry, {
        cwd: environment.cwd,
        platform: environment.platform,
        shell: environment.shell,
        params,
      }),
    [entry, environment.cwd, environment.platform, environment.shell, params]
  );

  const { policy, finalCommand, cwd, executability } = preview;

  // The example may itself be complete; only prompt for what is actually left.
  const prompts = useMemo(() => buildPrompts(finalCommand, entry), [finalCommand, entry]);
  const needsFilling =
    policy.canExecute &&
    executability.reason === 'unfilled-placeholder' &&
    prompts.length > 0;
  const currentPrompt = prompts[fillIndex];

  // Blocked means it can never run: policy, or a shell dependency we refuse.
  const blocked =
    !policy.canExecute || (!executability.executable && executability.reason === 'shell-evaluation');

  const startExecution = () => {
    setExecutionState('RUNNING');
    setOutputStream('');
    setExecError(null);

    executeCommand({
      commandLine: finalCommand,
      cwd,
      platform: environment.platform,
      shellType: environment.shell,
      onStdout: (chunk) => setOutputStream((prev) => prev + chunk),
      onStderr: (chunk) => setOutputStream((prev) => prev + chunk),
    })
      .then((res) => {
        setExecResult(res);
        setExecutionState('DONE');
        if (res.exitCode !== 0 && res.stderr) {
          setExecError(res.stderr);
        }
      })
      .catch((err: unknown) => {
        setExecError(err instanceof Error ? err.message : String(err));
        setExecutionState('DONE');
      });
  };

  const commitFillValue = () => {
    if (!currentPrompt) return;
    const raw = fillBuffer.trim() || currentPrompt.hint || '';

    if (!raw) {
      setFillError('A value is required.');
      return;
    }

    try {
      const clean = sanitizeParameter(raw);
      setParams((prev) => ({ ...prev, [currentPrompt.name]: clean }));
      setFillBuffer('');
      setFillError(null);
      setFillIndex((i) => i + 1);
    } catch (err) {
      // Reject and let the user retry rather than aborting the whole flow.
      setFillError(err instanceof Error ? err.message : String(err));
      setFillBuffer('');
    }
  };

  useInput((input, key) => {
    if (executionState === 'RUNNING') {
      return;
    }

    if (executionState === 'DONE') {
      if (key.return || key.escape || input === 'b' || input === 'B') {
        onBack();
      }
      return;
    }

    if (blocked) {
      if (key.return || key.escape || input === 'b' || input === 'B') {
        onBack();
      }
      return;
    }

    // Placeholder filling takes precedence over the confirmation prompt.
    if (needsFilling && currentPrompt) {
      if (key.escape) {
        onBack();
        return;
      }
      if (key.return) {
        commitFillValue();
        return;
      }
      if (key.backspace || key.delete) {
        setFillBuffer((prev) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setFillBuffer((prev) => prev + input);
      }
      return;
    }

    if (key.escape) {
      onBack();
      return;
    }

    if (policy.requiresStrictUppercaseConfirm) {
      if (key.return) {
        if (inputBuffer.trim() === 'YES') {
          startExecution();
        } else {
          setInputBuffer('');
        }
        return;
      }
      if (key.backspace || key.delete) {
        setInputBuffer((prev) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setInputBuffer((prev) => prev + input);
      }
      return;
    }

    if (input === 'd' || input === 'D') {
      if (onDisableExecution) {
        onDisableExecution();
      }
      onBack();
      return;
    }

    if (input === 'n' || input === 'N') {
      onBack();
      return;
    }

    if (input === 'y' || input === 'Y' || key.return) {
      startExecution();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={policy.requiresStrictUppercaseConfirm ? 'red' : 'cyan'}
      padding={1}
    >
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text bold color="white">
          COMMAND EXECUTION PREVIEW
        </Text>
        <Text bold color={getRiskBadgeColor(policy.level)}>
          RISK: {policy.level.toUpperCase()}
        </Text>
      </Box>

      <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="#334155" marginBottom={1}>
        <Text bold color="white">
          Command: {finalCommand}
        </Text>
        <Text color="white">Working Dir: {cwd}</Text>
      </Box>

      {policy.warningNotice && (
        <Box
          paddingX={1}
          borderStyle="single"
          borderColor={policy.requiresStrictUppercaseConfirm ? '#f87171' : '#fbbf24'}
          marginBottom={1}
        >
          <Text bold color={policy.requiresStrictUppercaseConfirm ? '#f87171' : '#fbbf24'}>
            ⚠ {policy.warningNotice}
          </Text>
        </Box>
      )}

      {executionState === 'RUNNING' && (
        <Box flexDirection="column" marginY={1}>
          <Text color="yellow" bold>
            ⚡ Executing command in progress...
          </Text>
          <Box borderStyle="single" borderColor="gray" paddingX={1} minHeight={3}>
            <Text color="white">{outputStream || 'Waiting for process output...'}</Text>
          </Box>
        </Box>
      )}

      {executionState === 'DONE' && (
        <Box flexDirection="column" marginY={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color={execResult && execResult.exitCode === 0 ? 'green' : 'red'}>
              {execResult && execResult.exitCode === 0
                ? '✓ Execution Completed (Success)'
                : `× Process Exited with Code: ${execResult?.exitCode ?? 'Error'}`}
            </Text>
            {execResult && <Text color="gray">Duration: {execResult.durationMs}ms</Text>}
          </Box>
          <Box borderStyle="single" borderColor="gray" paddingX={1} minHeight={4}>
            <Text color="white">
              {outputStream || execResult?.stdout || execError || '(No standard output generated)'}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color="cyan">[Enter / B] Return to Command Details</Text>
          </Box>
        </Box>
      )}

      {executionState === 'PROMPT' && (
        <Box flexDirection="column" marginTop={1}>
          {blocked ? (
            <Box flexDirection="column">
              <Text color="red" bold>
                {policy.canExecute
                  ? 'This command cannot be executed by CmdMentor.'
                  : 'Execution is blocked by safety policy.'}
              </Text>
              <Text color="#fbbf24">
                {policy.canExecute ? executability.detail : policy.warningNotice}
              </Text>
              <Text color="gray">[B / Enter] Return</Text>
            </Box>
          ) : needsFilling && currentPrompt ? (
            <Box flexDirection="column">
              <Text bold color="#38bdf8">
                Fill in placeholder {fillIndex + 1} of {prompts.length}
              </Text>
              <Box flexDirection="row">
                <Text color="#94a3b8">{'<'}{currentPrompt.name}{'>'} </Text>
                <Text color="cyan">&gt; </Text>
                <Text color="white" bold>
                  {fillBuffer}
                </Text>
                <Text color="gray">_</Text>
              </Box>
              {currentPrompt.hint && (
                <Text color="#64748b">
                  Press Enter to accept the example value: {currentPrompt.hint}
                </Text>
              )}
              {fillError && (
                <Text color="#f87171" bold>
                  {fillError}
                </Text>
              )}
              <Text color="gray">[Enter] Accept  [Esc] Cancel</Text>
            </Box>
          ) : policy.requiresStrictUppercaseConfirm ? (
            <Box flexDirection="column">
              <Text bold color="red">
                Type &apos;YES&apos; and press Enter to confirm execution:
              </Text>
              <Box flexDirection="row">
                <Text color="cyan">&gt; </Text>
                <Text color="white" bold>
                  {inputBuffer}
                </Text>
                <Text color="gray">_</Text>
              </Box>
              <Text color="gray">[Esc] Cancel</Text>
            </Box>
          ) : (
            <Box flexDirection="row">
              <Text bold color="yellow">
                Execute this command? [Y] Yes  [N] No  [D] Disable Execution
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
