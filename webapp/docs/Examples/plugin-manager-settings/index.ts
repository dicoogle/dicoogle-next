/**
 * Plugin Manager Settings - Settings Type
 * Adds plugin management tab to settings page
 */

import { WebUIPlugin, SettingsExtension, PluginContext } from "@/plugin-system";
import { lazy } from "react";
import { Plug } from "lucide-react";

const PluginManagerSettings = lazy(() => import("./PluginManagerSettings"));

const pluginManagerSettingsPlugin: WebUIPlugin = {
  metadata: {
    id: "plugin-manager-settings",
    name: "Plugin Manager Settings",
    version: "1.0.0",
    description: "Manage installed plugins from settings",
    author: "Dicoogle Team",
    type: "settings",
  },

  init: async (context: PluginContext) => {
    context.logger.info("Plugin Manager Settings initialized");
  },

  getSettingsExtensions: (): SettingsExtension[] => [
    {
      id: "plugin-manager-tab",
      label: "Plugins",
      icon: Plug.toString(),
      component: PluginManagerSettings,
      order: 100,
    },
  ],
};

export default pluginManagerSettingsPlugin;
