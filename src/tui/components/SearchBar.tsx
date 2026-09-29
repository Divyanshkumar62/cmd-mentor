import React from 'react';
import { Box, Text } from 'ink';

interface SearchBarProps {
  query: string;
  totalResults: number;
}

export const SearchBar: React.FC<SearchBarProps> = ({ query, totalResults }) => {
  return (
    <Box
      borderStyle="round"
      borderColor="#2563eb"
      paddingX={1}
      flexDirection="row"
      justifyContent="space-between"
    >
      <Box flexDirection="row">
        <Text bold color="#2563eb">
          Search
        </Text>
        <Text color="#60a5fa"> › </Text>
        <Text color="#f8fafc" bold>
          {query}
        </Text>
        {!query && (
          <Text color="#64748b">Type command or task (e.g. checkout, docker)...</Text>
        )}
      </Box>
      <Box>
        <Text color="#94a3b8">
          [{totalResults} match{totalResults === 1 ? '' : 'es'}]
        </Text>
      </Box>
    </Box>
  );
};
