import React from 'react';
import { Button } from '@/components/ui/Button';
import { FolderCheck } from 'lucide-react';

interface FileBrowserFooterProps {
  currentPath: string;
  selectedFile?: { isDir: boolean; path: string; name: string } | null;
  onSelect: () => void;
  onCancel: () => void;
}

export const FileBrowserFooter: React.FC<FileBrowserFooterProps> = ({
  currentPath,
  selectedFile,
  onSelect,
  onCancel,
}) => {
  const getSelectionText = () => {
    if (selectedFile && selectedFile.isDir) {
      return `Select "${selectedFile.name}"`;
    }
    return 'Select This Directory';
  };
  
  const getInstructionText = () => {
    if (selectedFile && selectedFile.isDir) {
      return `Folder "${selectedFile.name}" is selected. Click to choose it, or double-click to navigate into it.`;
    }
    return 'Double-click a folder to navigate, or click Select to choose the current directory.';
  };

  return (
    <div className="mt-4 pt-4 border-t">
      <p className="text-sm text-gray-600 mb-3">
        {getInstructionText()}
      </p>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="default"
          onClick={onSelect}
          disabled={!currentPath}
        >
          <FolderCheck className="h-4 w-4 mr-2" />
          {getSelectionText()}
        </Button>
      </div>
    </div>
  );
};
