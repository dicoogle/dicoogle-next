import { useState, useCallback, useRef } from 'react';
import { filesystemService, type FileEntry, type FolderChainItem } from '@/services/filesystemService';

export const useFileBrowser = () => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [folderChain, setFolderChain] = useState<FolderChainItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [viewVersion, setViewVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Navigation history - use refs to avoid dependency issues
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  // Compute navigation state from refs
  const canGoBack = historyIndexRef.current > 0;
  const canGoForward = historyIndexRef.current < historyRef.current.length - 1;

  const loadDirectory = useCallback(async (path: string, addToHistory = true) => {
    setLoading(true);
    setError(null);

    try {
      const data = await filesystemService.getDirectory(path);
      setFiles(data.files);
      setFolderChain(data.folderChain);
      setCurrentPath(data.currentPath);
      setViewVersion((prev) => prev + 1);

      // Update history
      if (addToHistory) {
        // Check if this path is different from the current path in history
        const currentHistoryPath = historyRef.current[historyIndexRef.current];
        if (currentHistoryPath !== path) {
          // Remove any forward history
          historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
          // Add new path
          historyRef.current.push(path);
          historyIndexRef.current = historyRef.current.length - 1;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load directory';
      setError(errorMessage);
      console.error('Failed to load directory:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRoots = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const roots = await filesystemService.getRoots();
      if (roots.length > 0) {
        await loadDirectory(roots[0]);
      } else {
        setError('No accessible root directories found');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load roots';
      setError(errorMessage);
      console.error('Failed to load roots:', err);
      setLoading(false);
    }
  }, [loadDirectory]);

  const goBack = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const path = historyRef.current[historyIndexRef.current];
      loadDirectory(path, false);
    }
  }, [loadDirectory]);

  const goForward = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const path = historyRef.current[historyIndexRef.current];
      loadDirectory(path, false);
    }
  }, [loadDirectory]);

  return {
    files,
    folderChain,
    currentPath,
    viewVersion,
    loading,
    error,
    loadDirectory,
    loadRoots,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
  };
};
