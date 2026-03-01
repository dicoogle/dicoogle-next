import React from 'react';
import { AlertCircle } from 'lucide-react';

interface FileBrowserErrorProps {
  error: string;
}

export const FileBrowserError: React.FC<FileBrowserErrorProps> = ({ error }) => {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-medium text-red-900">Error Loading Directory</h3>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      </div>
    </div>
  );
};
