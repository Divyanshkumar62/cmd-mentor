import React, { useState, useEffect, useMemo } from 'react';
import { Box, useApp, useInput } from 'ink';
import { KnowledgeBaseLoader } from '../knowledge-base/loader.js';
import { SearchEngine, SearchResult } from '../search/engine.js';
import { EnvironmentContext } from '../types/environment.js';
import { SearchBar } from './components/SearchBar.js';
import { ResultList } from './components/ResultList.js';
import { DetailView } from './components/DetailView.js';
import { StatusBar } from './components/StatusBar.js';
import { FuzzyView } from './components/FuzzyView.js';
import { ExecutionModal } from './components/ExecutionModal.js';
import { copyToClipboard } from '../clipboard/index.js';
import { BookmarkStore } from '../storage/bookmarks.js';
import { ConfigStore } from '../storage/config.js';
import { HistoryStore } from '../storage/history.js';

export interface AppProps {
  initialQuery?: string;
  knowledgeBase: KnowledgeBaseLoader;
  environment: EnvironmentContext;
  mode?: 'FULL' | 'FUZZY';
  bookmarkStore?: BookmarkStore;
  configStore?: ConfigStore;
  historyStore?: HistoryStore;
}

export const App: React.FC<AppProps> = ({
  initialQuery = '',
  knowledgeBase,
  environment,
  mode = 'FULL',
  bookmarkStore = new BookmarkStore(),
  configStore = new ConfigStore(),
  historyStore = new HistoryStore(),
}) => {
  const { exit } = useApp();
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentScreen, setCurrentScreen] = useState<'SEARCH' | 'DETAIL' | 'EXECUTE'>('SEARCH');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(() => new Set(bookmarkStore.list()));
  const [terminalCols, setTerminalCols] = useState(() => process.stdout.columns || environment.terminal.columns || 80);
  const [terminalRows, setTerminalRows] = useState(() => process.stdout.rows || environment.terminal.rows || 24);

  useEffect(() => {
    const handleResize = () => {
      if (process.stdout.columns) {
        setTerminalCols(process.stdout.columns);
      }
      if (process.stdout.rows) {
        setTerminalRows(process.stdout.rows);
      }
    };
    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  const maxListRows = Math.max(5, Math.min(20, terminalRows - 10));

  const config = useMemo(() => configStore.get(), [configStore]);

  // Record initial query if present
  useEffect(() => {
    if (initialQuery.trim()) {
      historyStore.record(initialQuery, config.history.enabled, 'SEARCH');
    }
  }, [initialQuery, historyStore, config.history.enabled]);

  // Search Engine
  const searchEngine = useMemo(() => {
    return new SearchEngine(knowledgeBase.getAll());
  }, [knowledgeBase]);

  // Results calculation
  const results: SearchResult[] = useMemo(() => {
    return searchEngine.search(query, {
      preferredPlatform: environment.platform,
      preferredShell: environment.shell,
    });
  }, [searchEngine, query, environment.platform, environment.shell]);

  // Bound selected index
  useEffect(() => {
    if (selectedIndex >= results.length) {
      setSelectedIndex(Math.max(0, results.length - 1));
    }
  }, [results.length, selectedIndex]);

  // Auto-clear toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [toastMessage]);

  const selectedResult = results[selectedIndex];

  const handleCopySelected = (customCommand?: string) => {
    if (selectedResult) {
      const cmdToCopy =
        customCommand ||
        selectedResult.entry.examples[0]?.command ||
        selectedResult.entry.commandTemplate;
      void copyToClipboard(cmdToCopy).then((res) => {
        if (res.success) {
          setToastMessage(`✓ Copied "${cmdToCopy}" to clipboard!`);
        } else {
          setToastMessage(`⚠ ${res.error || 'Failed to copy to clipboard'}`);
        }
      });
    }
  };

  const handleToggleBookmark = () => {
    if (selectedResult) {
      const id = selectedResult.entry.id;
      if (bookmarkStore.isBookmarked(id)) {
        bookmarkStore.remove(id);
        setBookmarkedIds(new Set(bookmarkStore.list()));
        setToastMessage(`Removed bookmark for "${selectedResult.entry.name}"`);
      } else {
        bookmarkStore.add(id);
        setBookmarkedIds(new Set(bookmarkStore.list()));
        setToastMessage(`★ Bookmarked "${selectedResult.entry.name}"!`);
      }
    }
  };

  useInput((input, key) => {
    // If on EXECUTE screen, key handling is delegated to ExecutionModal
    if (currentScreen === 'EXECUTE') {
      return;
    }

    // Direct terminal exit shortcuts
    if (key.ctrl && (input === 'c' || input === 'C' || input === 'q' || input === 'Q')) {
      exit();
      return;
    }

    // DETAIL Screen Keys
    if (currentScreen === 'DETAIL') {
      if (key.escape || input === 'b' || input === 'B' || key.backspace || key.delete) {
        setCurrentScreen('SEARCH');
        return;
      }
      if (input === 'c' || input === 'C') {
        handleCopySelected();
        return;
      }
      if ((input === 'x' || input === 'X' || input === 'e' || input === 'E') && config.execution.enabled) {
        if (selectedResult) {
          historyStore.record(selectedResult.entry.name, config.history.enabled, 'EXECUTE');
          setCurrentScreen('EXECUTE');
        }
        return;
      }
      if (input === 's' || input === 'S') {
        handleToggleBookmark();
        return;
      }
      if (input === 'q' || input === 'Q') {
        exit();
        return;
      }
      return;
    }

    // SEARCH Screen Keys
    if (key.escape) {
      if (query.length > 0) {
        setQuery('');
        return;
      }
      exit();
      return;
    }

    // Quick-copy highlighted command directly from search
    if (key.tab) {
      handleCopySelected();
      return;
    }

    // Quick-bookmark highlighted command
    if (key.ctrl && (input === 'b' || input === 'B')) {
      handleToggleBookmark();
      return;
    }

    if (key.upArrow || (key.ctrl && (input === 'p' || input === 'P'))) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      return;
    }

    if (key.downArrow || (key.ctrl && (input === 'n' || input === 'N'))) {
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.pageUp) {
      setSelectedIndex((prev) => Math.max(0, prev - 5));
      return;
    }

    if (key.pageDown) {
      setSelectedIndex((prev) => Math.min(results.length - 1, prev + 5));
      return;
    }

    if (key.return) {
      if (results.length > 0) {
        setCurrentScreen('DETAIL');
      }
      return;
    }

    if (key.backspace || key.delete) {
      setQuery((prev) => prev.slice(0, -1));
      return;
    }

    // Append all regular printable characters (never intercept 'c', 'e', 's', 'q' in search)
    if (input && !key.ctrl && !key.meta && !key.tab) {
      setQuery((prev) => prev + input);
    }
  });

  if (mode === 'FUZZY') {
    return <FuzzyView initialQuery={initialQuery} results={results} />;
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={0} paddingBottom={1}>
      {currentScreen === 'SEARCH' && (
        <>
          <SearchBar query={query} totalResults={results.length} />
          <ResultList
            results={results}
            selectedIndex={selectedIndex}
            bookmarkedIds={bookmarkedIds}
            maxVisibleRows={maxListRows}
            terminalCols={terminalCols}
          />
        </>
      )}

      {currentScreen === 'DETAIL' && selectedResult && (
        <DetailView
          entry={selectedResult.entry}
          isBookmarked={bookmarkedIds.has(selectedResult.entry.id)}
        />
      )}

      {currentScreen === 'EXECUTE' && selectedResult && (
        <ExecutionModal
          entry={selectedResult.entry}
          environment={environment}
          onBack={() => setCurrentScreen('DETAIL')}
          onDisableExecution={() => {
            configStore.set('execution.enabled', false);
            setToastMessage('Command execution is now disabled globally.');
          }}
        />
      )}

      <StatusBar
        environment={environment}
        currentScreen={currentScreen}
        toastMessage={toastMessage}
        executionEnabled={config.execution.enabled}
      />
    </Box>
  );
};
