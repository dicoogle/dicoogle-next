/**
 * Gallery View Component - Alternative Result Renderer
 */

import { ResultRendererProps } from '@\/plugin-system';
import { useState } from 'react';
import { ZoomIn, Info } from 'lucide-react';

export default function GalleryView({
  results,
  loading,
  error,
  context,
  onResultSelect,
}: ResultRendererProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [gridColumns, setGridColumns] = useState(4);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading images...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">Error Loading Results</h3>
          <p className="text-red-600 mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="text-center p-12">
        <Info className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-700">No Results Found</h3>
        <p className="text-gray-500 mt-2">Try adjusting your search criteria</p>
      </div>
    );
  }

  const gridClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  }[gridColumns] || 'grid-cols-4';

  return (
    <div className="p-6">
      {/* Controls */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Gallery View ({results.length} results)
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span>Grid Columns:</span>
            <select
              value={gridColumns}
              onChange={(e) => setGridColumns(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1"
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
              <option value={6}>6</option>
            </select>
          </label>
        </div>
      </div>

      {/* Gallery Grid */}
      <div className={`grid ${gridClass} gap-4`}>
        {results.map((result, index) => {
          // Get SOP Instance UID - try multiple field names
          const sopInstanceUID = 
            result.fields?.SOPInstanceUID || 
            result.fields?.sopInstanceUID ||
            result.uri;
          
          // Only generate thumbnail URL if we have a valid UID
          const thumbnailUrl = sopInstanceUID && context.dicoogle
            ? context.dicoogle.getThumbnailUrl(sopInstanceUID)
            : null;
          
          const patientName = result.fields?.PatientName || 'Unknown';
          const modality = result.fields?.Modality || 'N/A';
          const studyDate = result.fields?.StudyDate || '';
          const formattedDate = formatStudyDate(studyDate);

          return (
            <div
              key={result.uri || index}
              className="group relative bg-white rounded-lg shadow-md overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-xl hover:scale-105"
              onClick={() => onResultSelect?.(result)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Image */}
              <div className="aspect-square bg-gray-100 relative overflow-hidden">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={patientName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="20" text-anchor="middle" x="100" y="110"%3ENo Image%3C/text%3E%3C/svg%3E';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <div className="text-center">
                      <Info className="w-12 h-12 mx-auto mb-2" />
                      <p className="text-sm">No Preview</p>
                    </div>
                  </div>
                )}

                {/* Hover Overlay */}
                {hoveredIndex === index && thumbnailUrl && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center transition-opacity">
                    <ZoomIn className="w-12 h-12 text-white" />
                  </div>
                )}

                {/* Modality Badge */}
                <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded">
                  {modality}
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <h3 className="font-semibold text-gray-900 truncate" title={patientName}>
                  {patientName}
                </h3>
                <p className="text-sm text-gray-500 mt-1">{formattedDate}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400 truncate" title={result.uri}>
                    {result.fields?.SeriesNumber
                      ? `Series ${result.fields.SeriesNumber}`
                      : 'No series'}
                  </span>
                  {result.fields?.InstanceNumber && (
                    <span className="text-xs text-gray-400">
                      #{result.fields.InstanceNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats Footer */}
      <div className="mt-6 text-center text-sm text-gray-500">
        Displaying {results.length} image{results.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

/**
 * Format DICOM study date (YYYYMMDD) to readable format
 */
function formatStudyDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) {
    return 'Unknown Date';
  }

  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);

  const date = new Date(`${year}-${month}-${day}`);
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
