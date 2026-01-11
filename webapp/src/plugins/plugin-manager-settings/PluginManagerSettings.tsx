/**
 * Plugin Manager Settings Component
 */

import { useState, useEffect } from "react";
import { pluginRegistry } from "@/plugin-system/registry";
import { enablePlugin, disablePlugin } from "@/plugin-system/manager";
import { WebUIPlugin } from "@/plugin-system/types";
import { Power, PowerOff, Info, ExternalLink } from "lucide-react";

export default function PluginManagerSettings() {
  const [plugins, setPlugins] = useState<WebUIPlugin[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPlugins();

    // Listen for plugin state changes
    const handlePluginStateChange = () => {
      loadPlugins();
    };

    window.addEventListener("plugin-state-changed", handlePluginStateChange);
    return () => {
      window.removeEventListener(
        "plugin-state-changed",
        handlePluginStateChange,
      );
    };
  }, []);

  const loadPlugins = () => {
    const allPlugins = pluginRegistry.getAllPlugins();
    setPlugins(allPlugins);
  };

  const handleToggle = async (pluginId: string, currentlyEnabled: boolean) => {
    setLoading(true);
    try {
      if (currentlyEnabled) {
        await disablePlugin(pluginId);
      } else {
        await enablePlugin(pluginId);
      }
      loadPlugins();
    } catch (error) {
      console.error("Failed to toggle plugin:", error);
      alert(`Failed to ${currentlyEnabled ? "disable" : "enable"} plugin`);
    } finally {
      setLoading(false);
    }
  };

  const getPluginTypeLabel = (type: any): string => {
    if (Array.isArray(type)) {
      return type.join(", ");
    }
    return type || "page";
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Plugin Manager</h2>
        <p className="text-gray-600 mt-2">
          Manage installed plugins. Enable or disable plugins to customize your
          experience.
        </p>
      </div>

      {/* Plugin List */}
      <div className="space-y-4">
        {plugins.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Info className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No plugins installed</p>
          </div>
        ) : (
          plugins.map((plugin) => {
            if (!plugin.metadata) {
              return (
                <div
                  key="NA"
                  className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                >
                  <h3>Plugin Information Not Available</h3>
                </div>
              );
            }
            const isEnabled = pluginRegistry.isPluginEnabled(
              plugin.metadata.id,
            );

            return (
              <div
                key={plugin.metadata.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  {/* Plugin Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {plugin.metadata.name}
                      </h3>
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                        v{plugin.metadata.version}
                      </span>
                      {isEnabled ? (
                        <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                          <Power className="w-3 h-3" />
                          Enabled
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                          <PowerOff className="w-3 h-3" />
                          Disabled
                        </span>
                      )}
                    </div>

                    <p className="text-gray-600 mt-2">
                      {plugin.metadata.description}
                    </p>

                    <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                      {plugin.metadata.author && (
                        <span>By {plugin.metadata.author}</span>
                      )}
                      <span className="flex items-center gap-1">
                        Type: {getPluginTypeLabel(plugin.metadata.type)}
                      </span>
                    </div>

                    {/* Plugin Capabilities */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {plugin.getRouteExtensions && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                          • Routes
                        </span>
                      )}
                      {plugin.getSidebarMenuExtensions && (
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded">
                          • Menu Items
                        </span>
                      )}
                      {plugin.getResultOptionsExtensions && (
                        <span className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded">
                          • Result Actions
                        </span>
                      )}
                      {plugin.getResultBatchExtensions && (
                        <span className="text-xs bg-pink-50 text-pink-700 px-2 py-1 rounded">
                          • Batch Actions
                        </span>
                      )}
                      {plugin.getQueryFilterExtensions && (
                        <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                          • Query Filters
                        </span>
                      )}
                      {plugin.getResultRendererExtensions && (
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                          • Result Renderers
                        </span>
                      )}
                      {plugin.getSettingsExtensions && (
                        <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded">
                          • Settings
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Toggle Button */}
                  <div className="ml-6">
                    <button
                      onClick={() => {
                        if (plugin.metadata) {
                          handleToggle(plugin.metadata.id, isEnabled);
                        }
                      }}
                      disabled={loading}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        isEnabled
                          ? "bg-red-100 text-red-700 hover:bg-red-200"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {loading
                        ? "Loading..."
                        : isEnabled
                          ? "Disable"
                          : "Enable"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium">About Plugins</p>
            <p className="mt-1 text-blue-800">
              Plugins extend Dicoogle's functionality. Disabling a plugin will
              remove its features from the interface. Changes take effect
              immediately.
            </p>
            <a
              href="https://github.com/bioinformatics-ua/dicoogle-next/blob/main/PLUGIN_TYPES_GUIDE.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-blue-700 hover:text-blue-800 font-medium"
            >
              Learn more about plugins
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 text-sm text-gray-500 text-center">
        {plugins.length} plugin{plugins.length !== 1 ? "s" : ""} installed •{" "}
        {pluginRegistry.getEnabledPlugins().length} enabled
      </div>
    </div>
  );
}
