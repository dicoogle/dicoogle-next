import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { apiService, type Plugin } from "@/services/api";
import { toast } from "@/utils/toast";

type PluginType = "index" | "query" | "storage" | "all";

export function PluginSettings() {
  const [allPlugins, setAllPlugins] = useState<Plugin[]>([]);
  const [selectedType, setSelectedType] = useState<PluginType>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingPlugin, setUpdatingPlugin] = useState<string | null>(null);

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    try {
      setLoading(true);
      setError(null);
      const pluginsList = await apiService.getPlugins();
      setAllPlugins(pluginsList);
    } catch (err) {
      setError("Failed to load plugins");
      console.error(err);
      setAllPlugins([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlugin = async (
    pluginName: string,
    pluginType: string,
    currentEnabled: boolean,
  ) => {
    const newEnabled = !currentEnabled;
    const pluginKey = `${pluginName}-${pluginType}`;
    setUpdatingPlugin(pluginKey);

    try {
      await apiService.togglePluginState(pluginType, pluginName, newEnabled);

      // Update local state
      setAllPlugins((plugins) =>
        plugins.map((p) =>
          p.name === pluginName && p.type === pluginType
            ? { ...p, enabled: newEnabled }
            : p,
        ),
      );

      toast.success(
        `Plugin "${pluginName}" ${newEnabled ? "enabled" : "disabled"} successfully`,
      );
    } catch (err: any) {
      if (err.response?.status === 500) {
        toast.error(
          `The "${pluginName}" plugin cannot be ${newEnabled ? "enabled" : "disabled"}`,
        );
      } else {
        // Extract error message from response
        let errorMsg = `Failed to ${newEnabled ? "enable" : "disable"} plugin`;
        if (err.response?.data) {
          const htmlMatch = err.response.data.match(/<pre>\s*(.+?)\s*<\/pre>/);
          if (htmlMatch) {
            errorMsg = htmlMatch[1];
          }
        }
        toast.error(errorMsg);
      }
      console.error(err);
    } finally {
      setUpdatingPlugin(null);
    }
  };

  // Filter plugins based on selected type
  const filteredPlugins =
    selectedType === "all"
      ? allPlugins
      : allPlugins.filter((p) => p.type.toLowerCase() === selectedType);

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "index":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200";
      case "query":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200";
      case "storage":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200";
    }
  };

  const getTypeCounts = () => {
    return {
      index: allPlugins.filter((p) => p.type.toLowerCase() === "index").length,
      query: allPlugins.filter((p) => p.type.toLowerCase() === "query").length,
      storage: allPlugins.filter((p) => p.type.toLowerCase() === "storage")
        .length,
    };
  };

  const counts = getTypeCounts();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading plugins...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Installed Plugins
        </h2>
        <p className="text-sm text-muted-foreground">
          View and manage installed Dicoogle plugins.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 text-sm border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Plugin Type Legend - Clickable for Filtering */}
      <Card className="p-4 bg-muted/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* All */}
          <button
            onClick={() => setSelectedType("all")}
            className={`p-3 rounded-lg text-left transition-all ${
              selectedType === "all"
                ? "ring-2 ring-primary bg-primary/10"
                : "hover:bg-muted"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-gray-500"></span>
              <span className="text-sm font-medium text-foreground">
                All Plugins
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {allPlugins.length} total
            </span>
          </button>

          {/* Index */}
          <button
            onClick={() => setSelectedType("index")}
            className={`p-3 rounded-lg text-left transition-all ${
              selectedType === "index"
                ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "hover:bg-muted"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="text-sm font-medium text-foreground">
                Indexing
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {counts.index} plugin{counts.index !== 1 ? "s" : ""}
            </span>
          </button>

          {/* Query */}
          <button
            onClick={() => setSelectedType("query")}
            className={`p-3 rounded-lg text-left transition-all ${
              selectedType === "query"
                ? "ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/20"
                : "hover:bg-muted"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              <span className="text-sm font-medium text-foreground">Query</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {counts.query} plugin{counts.query !== 1 ? "s" : ""}
            </span>
          </button>

          {/* Storage */}
          <button
            onClick={() => setSelectedType("storage")}
            className={`p-3 rounded-lg text-left transition-all ${
              selectedType === "storage"
                ? "ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-900/20"
                : "hover:bg-muted"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className="text-sm font-medium text-foreground">
                Storage
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {counts.storage} plugin{counts.storage !== 1 ? "s" : ""}
            </span>
          </button>
        </div>
      </Card>

      {/* Plugins List */}
      <div className="space-y-3">
        {filteredPlugins.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-muted-foreground text-center py-4">
              {allPlugins.length === 0
                ? "No plugins installed"
                : "No plugins of this type"}
            </p>
          </Card>
        ) : (
          filteredPlugins.map((plugin, index) => {
            // Create unique key using name, type, and index to handle duplicates
            const pluginKey = `${plugin.name}-${plugin.type}-${index}`;
            const updateKey = `${plugin.name}-${plugin.type}`;

            return (
              <Card key={pluginKey} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-base font-semibold text-foreground">
                        {plugin.name}
                      </h3>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getTypeColor(
                          plugin.type,
                        )}`}
                      >
                        {plugin.type.charAt(0).toUpperCase() +
                          plugin.type.slice(1)}
                      </span>
                      {plugin.enabled && (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200">
                          Active
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Enable/Disable Toggle - always visible but disabled if not supported */}
                  <button
                    onClick={() =>
                      handleTogglePlugin(
                        plugin.name,
                        plugin.type,
                        plugin.enabled,
                      )
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      plugin.enabled
                        ? "bg-green-600"
                        : "bg-gray-300 dark:bg-gray-600"
                    }`}
                    title={plugin.enabled ? "Disable plugin" : "Enable plugin"}
                  >
                    {updatingPlugin === updateKey && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      </div>
                    )}
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        plugin.enabled ? "translate-x-6" : "translate-x-1"
                      } ${
                        updatingPlugin === updateKey
                          ? "opacity-0"
                          : "opacity-100"
                      }`}
                    />
                  </button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Information Section */}
      <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
          ℹ️ Plugin Information
        </h4>
        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          Plugins extend Dicoogle's functionality. Plugin configuration can be
          managed through the plugin configuration files in the Dicoogle plugins
          directory.
        </p>
      </Card>
    </div>
  );
}
