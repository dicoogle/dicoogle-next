import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { apiService, type Version } from '@/services/api';

export function SystemInfo() {
  const [version, setVersion] = useState<Version | null>(null);
  const [aeTitle, setAETitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSystemInfo();
  }, []);

  const loadSystemInfo = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load version
      const versionData = await apiService.getVersion();
      setVersion(versionData);

      // Load AE Title
      const aeTitleData = await apiService.getAETitle();
      setAETitle(aeTitleData.aetitle || 'DICOOGLE');
    } catch (err) {
      setError('Failed to load system information');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading system information...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-2">System Information</h2>
        <p className="text-sm text-muted-foreground">View Dicoogle instance details and settings</p>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 text-sm border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Application Info */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Dicoogle Application</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Version" value={version?.version || 'Unknown'} />
          <InfoRow label="AE Title" value={aeTitle} />
        </div>
      </Card>

      {/* Information Section */}
      <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
          ℹ About Dicoogle
        </h4>
        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed mb-2">
          Dicoogle is an open-source PACS (Picture Archiving and Communications System) that
          provides a modern alternative to traditional medical image archiving solutions.
        </p>
        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          For more information, visit{' '}
          <a
            href="https://www.dicoogle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
          >
            dicoogle.com
          </a>
        </p>
      </Card>

      {/* Management Links */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Configuration</h3>
        <p className="text-xs text-muted-foreground mb-4">
          To modify advanced settings, edit the Dicoogle configuration files directly:
        </p>
        <ul className="text-xs text-foreground space-y-2 list-disc list-inside">
          <li>Index settings: Edit plugin configuration files</li>
          <li>Service ports: Modify service configuration</li>
          <li>Plugin management: Add/remove plugins from the plugins directory</li>
        </ul>
      </Card>

      {/* Reload Button */}
      <div className="flex justify-end">
        <button
          onClick={loadSystemInfo}
          className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
        >
          ⟳ Refresh
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-medium text-foreground font-mono break-all">{value}</p>
    </div>
  );
}
