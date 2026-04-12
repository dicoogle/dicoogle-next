import React, { useEffect, useState } from 'react';
import {
  FileBrowser,
  FileNavbar,
  FileToolbar,
  FileList,
  FileContextMenu,
  type ChonkyFileActionData,
  type FileData,
} from 'chonky';
import { ChonkyIconFA } from 'chonky-icon-fontawesome';
import { setChonkyDefaults } from 'chonky';
import { ChonkyActions } from 'chonky';
import { useFileBrowser } from './hooks/useFileBrowser';
import { FileBrowserHeader } from './components/FileBrowserHeader';
import { FileBrowserFooter } from './components/FileBrowserFooter';
import { FileBrowserError } from './components/FileBrowserError';

setChonkyDefaults({ iconComponent: ChonkyIconFA as any });

interface FileBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPathSelect: (path: string) => void;
}

const selectDirectoryAction = {
  id: 'select_directory',
  button: {
    name: 'Select',
    toolbar: true,
    contextMenu: true,
    group: 'Actions',
    icon: 'check',
  },
};

export const FileBrowserModal: React.FC<FileBrowserModalProps> = ({
  isOpen,
  onClose,
  onPathSelect,
}) => {
  const {
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
  } = useFileBrowser();

  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRoots();
      setSelectedFile(null);
    }
  }, [isOpen, loadRoots]);

  const handleFileAction = (data: ChonkyFileActionData) => {
    if (data.id === ChonkyActions.OpenFiles.id) {
      const file = data.payload.targetFile || data.payload.files?.[0];
      if (file && file.isDir) {
        loadDirectory(file.path);
        setSelectedFile(null);
      }
    } else if (data.id === ChonkyActions.ChangeSelection.id) {
      const selectedFilesState = data.state.selectedFiles;

      if (selectedFilesState && Array.isArray(selectedFilesState) && selectedFilesState.length > 0) {
        const selectedFileData = selectedFilesState[0] as FileData;

        if (selectedFileData && selectedFileData.isDir) {
          setSelectedFile(selectedFileData);
        } else {
          setSelectedFile(null);
        }
      } else {
        setSelectedFile(null);
      }
    } else if (data.id === ChonkyActions.MouseClickFile.id) {
      const file = data.payload.file;
      if (file && file.isDir && data.payload.clickType === 'double') {
        loadDirectory(file.path);
        setSelectedFile(null);
      }
    } else if (data.id === selectDirectoryAction.id) {
      handleSelectDirectory();
    }
  };

  const handleSelectDirectory = () => {
    const pathToSelect = selectedFile?.isDir ? selectedFile.path : currentPath;
    if (pathToSelect) {
      onPathSelect(pathToSelect);
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-[90vw] h-[80vh] max-w-6xl flex flex-col">
        <div className="p-6 flex-shrink-0">
          <FileBrowserHeader
            currentPath={currentPath}
            onClose={onClose}
            onBack={goBack}
            onForward={goForward}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
          />
          {error && <FileBrowserError error={error} />}
        </div>

        <div className="flex-1 px-6 overflow-hidden">
          {loading && !files.length ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">Loading...</div>
            </div>
          ) : (
            <div className="h-full">
              <FileBrowser
                key={viewVersion}
                files={files}
                folderChain={folderChain}
                onFileAction={handleFileAction}
                fileActions={[selectDirectoryAction, ChonkyActions.OpenFiles]}
                defaultFileViewActionId={ChonkyActions.EnableListView.id}
                disableDragAndDrop={true}
              >
                <FileNavbar />
                <FileToolbar />
                <FileList />
                <FileContextMenu />
              </FileBrowser>
            </div>
          )}
        </div>

        <div className="p-6 flex-shrink-0">
          <FileBrowserFooter
            currentPath={currentPath}
            selectedFile={selectedFile && selectedFile.isDir ? {
              isDir: selectedFile.isDir,
              path: selectedFile.path,
              name: selectedFile.name,
            } : null}
            onSelect={handleSelectDirectory}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
};
