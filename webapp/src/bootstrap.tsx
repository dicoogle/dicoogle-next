import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import {
  configureApp,
  type DicoogleAppConfig,
  type DicoogleAppConfigInput,
} from "@/config/appConfig";
import { dicoogleService } from "@/services/dicoogleService";
import {
  initializeAllPlugins,
  invalidatePluginExtensionCache,
  pluginRegistry,
} from "@/plugin-system";
import type { PluginMetadata, WebUIPlugin } from "@/plugin-system";

/** A plugin, optionally with the metadata a plugin.config.json would otherwise provide. */
export type DicooglePluginRegistration =
  | WebUIPlugin
  | {
      plugin: WebUIPlugin;
      metadata?: Partial<PluginMetadata>;
      /** Enabled state on first load; later the user's choice in Management > Plugins wins. */
      enabled?: boolean;
    };

export interface DicoogleAppOptions extends DicoogleAppConfigInput {
  /** Plugins to register on top of any already registered. */
  plugins?: DicooglePluginRegistration[];
  /** Render inside React.StrictMode. Defaults to true. */
  strictMode?: boolean;
}

export interface DicoogleAppHandle {
  config: DicoogleAppConfig;
  /** Resolves once every enabled plugin has run its init(). */
  pluginsReady: Promise<void>;
  unmount: () => void;
}

function isWrapped(
  entry: DicooglePluginRegistration,
): entry is Exclude<DicooglePluginRegistration, WebUIPlugin> {
  return typeof entry === "object" && entry !== null && "plugin" in entry;
}

function registerPlugins(plugins: DicooglePluginRegistration[]): void {
  for (const entry of plugins) {
    const plugin = isWrapped(entry) ? entry.plugin : entry;
    const metadata = isWrapped(entry) ? entry.metadata : undefined;
    if (!metadata?.id && !plugin.metadata?.id) {
      console.error(
        "Skipping a plugin without an id: set metadata.id on the plugin or its registration.",
        plugin,
      );
      continue;
    }
    try {
      pluginRegistry.registerPlugin(
        plugin,
        metadata,
        isWrapped(entry) ? (entry.enabled ?? true) : true,
      );
    } catch (error) {
      console.error("Failed to register plugin:", error);
    }
  }
}

/**
 * Configures the app, registers and initialises the plugins, and renders the app into
 * `container`. Call it once.
 */
export function createDicoogleApp(
  container: Element | string,
  options: DicoogleAppOptions = {},
): DicoogleAppHandle {
  const element =
    typeof container === "string" ? document.querySelector(container) : container;
  if (!element) {
    throw new Error(`Dicoogle app container not found: ${String(container)}`);
  }

  const { plugins = [], strictMode = true, ...configInput } = options;
  const config = configureApp(configInput);
  dicoogleService.init();

  registerPlugins(plugins);
  invalidatePluginExtensionCache();
  const pluginsReady = initializeAllPlugins().catch((error) => {
    console.error("Failed to initialize plugins:", error);
  });

  const root = ReactDOM.createRoot(element);
  root.render(strictMode ? <React.StrictMode><App /></React.StrictMode> : <App />);

  return { config, pluginsReady, unmount: () => root.unmount() };
}
