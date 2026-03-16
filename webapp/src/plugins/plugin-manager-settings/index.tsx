/**
 * Plugin Manager Settings - Settings Type
 * Adds plugin management tab to settings page
 */

import { WebUIPlugin, SettingsExtension, PluginContext } from "@/plugin-system";
import { lazy } from "react";
import { Plug } from "lucide-react";

const PluginManagerSettings = lazy(() => import("./PluginManagerSettings"));

const pluginManagerSettingsPlugin: WebUIPlugin = {
  init: async (context: PluginContext) => {
    context.logger.info("Plugin Manager Settings initialized");
  },

  getSettingsExtensions: (): SettingsExtension[] => [
    {
      id: "plugin-manager-tab",
      label: "Plugin Manager",
      icon: <Plug className="w-4 h-4" />,
      component: PluginManagerSettings,
      order: 100,
    },
  ],
};

export default pluginManagerSettingsPlugin;
