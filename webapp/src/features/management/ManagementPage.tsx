import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PluginSettings } from './components/PluginSettings';
import { ServiceSettings } from './components/ServiceSettings';
import { SystemInfo } from './components/SystemInfo';

type TabType = 'services' | 'plugins' | 'system';

export function ManagementPage() {
  const [activeTab, setActiveTab] = useState<TabType>('services');
  const [settingsSaved, setSettingsSaved] = useState(false);

  const handleSaveSettings = () => {
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-foreground">Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure services, plugins, and view system information
          </p>
        </div>
      </div>

      {/* Notification */}
      {settingsSaved && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-4">
          <div className="p-3 rounded-md bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 text-sm border border-green-200 dark:border-green-800">
            ✓ Settings saved successfully
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border sticky top-0 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto" aria-label="Tabs">
            {(['services', 'plugins', 'system'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 capitalize transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {tab === 'plugins' ? 'Plugins' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'services' && (
          <ServiceSettings onSave={handleSaveSettings} />
        )}
        {activeTab === 'plugins' && (
          <PluginSettings onSave={handleSaveSettings} />
        )}
        {activeTab === 'system' && (
          <SystemInfo />
        )}
      </div>
    </div>
  );
}
