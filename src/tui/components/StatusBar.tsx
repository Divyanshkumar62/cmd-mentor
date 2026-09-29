import React from 'react';
import { Box, Text } from 'ink';
import { EnvironmentContext } from '../../types/environment.js';

interface StatusBarProps {
  environment: EnvironmentContext;
  currentScreen: 'SEARCH' | 'DETAIL' | 'EXECUTE';
  toastMessage: string | null;
  executionEnabled?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  environment,
  currentScreen,
  toastMessage,
  executionEnabled = true,
}) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Toast Notification */}
      {toastMessage && (
        <Box paddingX={1} borderStyle="single" borderColor="#2563eb" marginBottom={1}>
          <Text bold color="#38bdf8">✓ </Text>
          <Text bold color="#f8fafc">
            {toastMessage}
          </Text>
        </Box>
      )}

      {/* Environment info & navigation shortcuts */}
      <Box
        borderStyle="single"
        borderColor="#334155"
        paddingX={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <Box flexDirection="row">
          <Text color="#64748b">Env: </Text>
          <Text color="#60a5fa" bold>
            {environment.platform.toUpperCase()}
          </Text>
          <Text color="#475569"> / </Text>
          <Text color="#94a3b8">
            {environment.shell}
          </Text>
          {!executionEnabled && (
            <Text color="#f87171" bold>
              {' '}[EXEC OFF]
            </Text>
          )}
        </Box>

        <Box flexDirection="row">
          {currentScreen === 'SEARCH' && (
            <Box flexDirection="row">
              <Text color="#38bdf8">[↵ Enter] </Text>
              <Text color="#cbd5e1">Details  </Text>
              <Text color="#38bdf8">[Tab] </Text>
              <Text color="#cbd5e1">Copy  </Text>
              <Text color="#38bdf8">[Ctrl+B] </Text>
              <Text color="#cbd5e1">Bookmark  </Text>
              <Text color="#38bdf8">[Esc] </Text>
              <Text color="#cbd5e1">Clear/Quit</Text>
            </Box>
          )}
          {currentScreen === 'DETAIL' && (
            <Box flexDirection="row">
              <Text color="#38bdf8">[C] </Text>
              <Text color="#cbd5e1">Copy  </Text>
              {executionEnabled && (
                <>
                  <Text color="#38bdf8">[X] </Text>
                  <Text color="#cbd5e1">Exec  </Text>
                </>
              )}
              <Text color="#38bdf8">[B] </Text>
              <Text color="#cbd5e1">Bookmark  </Text>
              <Text color="#38bdf8">[Esc] </Text>
              <Text color="#cbd5e1">Back  </Text>
              <Text color="#38bdf8">[Q] </Text>
              <Text color="#cbd5e1">Quit</Text>
            </Box>
          )}
          {currentScreen === 'EXECUTE' && (
            <Box flexDirection="row">
              <Text color="#38bdf8">[Esc] </Text>
              <Text color="#cbd5e1">Cancel & Return</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
