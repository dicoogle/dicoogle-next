import React from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface FileBrowserHeaderProps {
  currentPath: string;
  onClose: () => void;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

export const FileBrowserHeader: React.FC<FileBrowserHeaderProps> = ({
  currentPath,
  onClose,
  onBack,
  onForward,
  canGoBack = false,
  canGoForward = false,
}) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3 flex-1">
        {/* Navigation buttons */}
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={!canGoBack}
            className="h-8 w-8 p-0"
            title="Go back"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onForward}
            disabled={!canGoForward}
            className="h-8 w-8 p-0"
            title="Go forward"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Title and path */}
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Select Directory</h2>
          <p className="text-sm text-gray-500 mt-1">
            {currentPath || 'Loading...'}
          </p>
        </div>
      </div>

      <button
        onClick={onClose}
        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
};
