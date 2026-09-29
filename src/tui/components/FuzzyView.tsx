import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { SearchResult } from '../../search/engine.js';
import { copyToClipboard } from '../../clipboard/index.js';

interface FuzzyViewProps {
  initialQuery: string;
  results: SearchResult[];
}

export const FuzzyView: React.FC<FuzzyViewProps> = ({ initialQuery, results }) => {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      exit();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.return || input === 'c' || input === 'C') {
      const selected = results[selectedIndex];
      if (selected) {
        const cmd = selected.entry.examples[0]?.command || selected.entry.commandTemplate;
        void copyToClipboard(cmd).then(() => {
          setToast(`Copied "${cmd}" to clipboard!`);
          setTimeout(() => {
            exit();
          }, 600);
        });
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={0} paddingBottom={1}>
      <Box flexDirection="row" marginBottom={1}>
        <Text bold color="cyan">
          Quick Search:
        </Text>
        <Text color="white"> "{initialQuery}"</Text>
        <Text color="gray"> ({results.length} results)</Text>
      </Box>

      {toast && (
        <Box paddingX={1} borderStyle="single" borderColor="#2563eb" marginBottom={1}>
          <Text bold color="#38bdf8">
            {toast}
          </Text>
        </Box>
      )}

      {results.length === 0 ? (
        <Text color="#fbbf24">No matching commands found.</Text>
      ) : (
        <Box flexDirection="column">
          {results.slice(0, 8).map((r, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Box key={r.entry.id} flexDirection="row">
                <Box width="4">
                  <Text bold color={isSelected ? '#38bdf8' : '#64748b'}>
                    {isSelected ? ' ❯ ' : '   '}
                  </Text>
                </Box>
                <Box width="26">
                  <Text bold color={isSelected ? '#f8fafc' : '#38bdf8'}>
                    {r.entry.name}
                  </Text>
                </Box>
                <Box width="35">
                  <Text color={isSelected ? '#f8fafc' : '#cbd5e1'}>
                    {r.entry.title}
                  </Text>
                </Box>
                <Box width="15">
                  <Text color={isSelected ? '#cbd5e1' : '#64748b'}>
                    {r.entry.platforms.join(',')}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">
          [Enter/C] Copy & Exit  [↑/↓] Navigate  [Q/Esc] Exit
        </Text>
      </Box>
    </Box>
  );
};
