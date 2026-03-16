/**
 * Plugin Hooks and Extension Resolution
 */

import { useEffect, useState, useCallback } from "react";
import { pluginRegistry } from "./registry";
import {
  RouteExtension,
  SidebarMenuExtension,
  WebUIPlugin,
  PluginState,
  PluginContext,
  QueryFilterExtension,
  ResultOptionsExtension,
  ResultBatchExtension,
  ResultRendererExtension,
  SettingsExtension,
  ExtensionFactoryArgs,
  ResolvedPluginExtension,
  QueryFilterApplyArgs,
  ResultOptionActionArgs,
  ResultBatchActionArgs,
} from "./types";
import { enablePlugin, disablePlugin } from "./manager";
import { createPluginContext, PLUGIN_STATE_CHANGED_EVENT } from "./context";
import type { Study } from "@/types";

type QueryFilterMethod = "getQueryFilterExtensions";
type ResultOptionsMethod = "getResultOptionsExtensions";
type ResultBatchMethod = "getResultBatchExtensions";
type ResultRendererMethod = "getResultRendererExtensions";
type SidebarMethod = "getSidebarMenuExtensions";
type RouteMethod = "getRouteExtensions";
type SettingsMethod = "getSettingsExtensions";

interface ExtensionCache {
  queryFilters: ResolvedPluginExtension<QueryFilterExtension>[];
  resultOptions: ResolvedPluginExtension<ResultOptionsExtension>[];
  resultBatches: ResolvedPluginExtension<ResultBatchExtension>[];
  resultRenderers: ResolvedPluginExtension<ResultRendererExtension>[];
  sidebarItems: ResolvedPluginExtension<SidebarMenuExtension>[];
  routes: ResolvedPluginExtension<RouteExtension>[];
  settings: ResolvedPluginExtension<SettingsExtension>[];
}

const extensionCache: ExtensionCache = {
  queryFilters: [],
  resultOptions: [],
  resultBatches: [],
  resultRenderers: [],
  sidebarItems: [],
  routes: [],
  settings: [],
};

let extensionCacheDirty = true;

function toFactoryArgs(pluginId: string): ExtensionFactoryArgs {
  return { context: createPluginContext(pluginId) };
}

function wrapQueryFilterExtensions(
  pluginId: string,
  extensions: QueryFilterExtension[],
): ResolvedPluginExtension<QueryFilterExtension>[] {
  return extensions.map((ext) => {
    const wrapped: QueryFilterExtension = {
      ...ext,
      applyFilter: ext.applyFilter
        ? (value: any, args?: QueryFilterApplyArgs) => {
            if (!ext.applyFilter) {
              return null;
            }
            if (ext.applyFilter.length >= 2) {
              return ext.applyFilter(value, args);
            }
            return ext.applyFilter(value);
          }
        : undefined,
    };

    return {
      ...wrapped,
      pluginId,
    };
  });
}

function wrapResultOptionExtensions(
  pluginId: string,
  extensions: ResultOptionsExtension[],
): ResolvedPluginExtension<ResultOptionsExtension>[] {
  return extensions.map((ext) => {
    const wrapped: ResultOptionsExtension = {
      ...ext,
      action: ((...invocation: unknown[]) => {
        if (invocation.length === 1 && typeof invocation[0] === "object") {
          return (ext.action as (args: ResultOptionActionArgs) => void | Promise<void>)(
            invocation[0] as ResultOptionActionArgs,
          );
        }

        const result = invocation[0] as Study;
        const context = invocation[1] as PluginContext;

        if (ext.action.length <= 1) {
          return (ext.action as (args: ResultOptionActionArgs) => void | Promise<void>)({
            result,
            context,
            pluginId,
          });
        }

        return (ext.action as (result: Study, context: PluginContext) => void | Promise<void>)(
          result,
          context,
        );
      }) as ResultOptionsExtension["action"],
    };

    return {
      ...wrapped,
      pluginId,
    };
  });
}

function wrapResultBatchExtensions(
  pluginId: string,
  extensions: ResultBatchExtension[],
): ResolvedPluginExtension<ResultBatchExtension>[] {
  return extensions.map((ext) => {
    const wrapped: ResultBatchExtension = {
      ...ext,
      action: ((...invocation: unknown[]) => {
        if (invocation.length === 1 && typeof invocation[0] === "object") {
          return (ext.action as (args: ResultBatchActionArgs) => void | Promise<void>)(
            invocation[0] as ResultBatchActionArgs,
          );
        }

        const results = invocation[0] as Study[];
        const context = invocation[1] as PluginContext;

        if (ext.action.length <= 1) {
          return (ext.action as (args: ResultBatchActionArgs) => void | Promise<void>)({
            results,
            context,
            pluginId,
          });
        }

        return (ext.action as (results: Study[], context: PluginContext) => void | Promise<void>)(
          results,
          context,
        );
      }) as ResultBatchExtension["action"],
    };

    return {
      ...wrapped,
      pluginId,
    };
  });
}

function resolveExtensionsByMethod<M extends keyof WebUIPlugin, T>(
  methodName: M,
  resolver: (pluginId: string, plugin: WebUIPlugin, method: WebUIPlugin[M]) => T[],
): T[] {
  const results: T[] = [];
  const plugins = pluginRegistry.getEnabledPlugins();

  for (const plugin of plugins) {
    const pluginId = plugin.metadata?.id;
    if (!pluginId) {
      continue;
    }

    const method = plugin[methodName];
    if (typeof method !== "function") {
      continue;
    }

    try {
      results.push(...resolver(pluginId, plugin, method));
    } catch (error) {
      console.error(`Error getting ${String(methodName)} from plugin ${pluginId}:`, error);
    }
  }

  return results;
}

function resolveQueryFilterExtensions(): ResolvedPluginExtension<QueryFilterExtension>[] {
  return resolveExtensionsByMethod<QueryFilterMethod, ResolvedPluginExtension<QueryFilterExtension>>(
    "getQueryFilterExtensions",
    (pluginId, _plugin, method) => {
      const fn = method as NonNullable<WebUIPlugin[QueryFilterMethod]>;
      const extensions = fn(toFactoryArgs(pluginId));
      return wrapQueryFilterExtensions(pluginId, extensions || []);
    },
  ).sort((a, b) => (a.order || 999) - (b.order || 999));
}

function resolveResultOptionsExtensions(): ResolvedPluginExtension<ResultOptionsExtension>[] {
  return resolveExtensionsByMethod<
    ResultOptionsMethod,
    ResolvedPluginExtension<ResultOptionsExtension>
  >("getResultOptionsExtensions", (pluginId, _plugin, method) => {
    const fn = method as NonNullable<WebUIPlugin[ResultOptionsMethod]>;
    const extensions = fn(toFactoryArgs(pluginId));
    return wrapResultOptionExtensions(pluginId, extensions || []);
  }).sort((a, b) => (a.order || 999) - (b.order || 999));
}

function resolveResultBatchExtensions(): ResolvedPluginExtension<ResultBatchExtension>[] {
  return resolveExtensionsByMethod<
    ResultBatchMethod,
    ResolvedPluginExtension<ResultBatchExtension>
  >("getResultBatchExtensions", (pluginId, _plugin, method) => {
    const fn = method as NonNullable<WebUIPlugin[ResultBatchMethod]>;
    const extensions = fn(toFactoryArgs(pluginId));
    return wrapResultBatchExtensions(pluginId, extensions || []);
  }).sort((a, b) => (a.order || 999) - (b.order || 999));
}

function resolveResultRendererExtensions(): ResolvedPluginExtension<ResultRendererExtension>[] {
  return resolveExtensionsByMethod<
    ResultRendererMethod,
    ResolvedPluginExtension<ResultRendererExtension>
  >("getResultRendererExtensions", (pluginId, _plugin, method) => {
    const fn = method as NonNullable<WebUIPlugin[ResultRendererMethod]>;
    const extensions = fn(toFactoryArgs(pluginId)) || [];
    return extensions.map((ext) => ({ ...ext, pluginId }));
  }).sort((a, b) => (a.order || 999) - (b.order || 999));
}

function resolveSidebarMenuExtensions(): ResolvedPluginExtension<SidebarMenuExtension>[] {
  return resolveExtensionsByMethod<SidebarMethod, ResolvedPluginExtension<SidebarMenuExtension>>(
    "getSidebarMenuExtensions",
    (pluginId, _plugin, method) => {
      const fn = method as NonNullable<WebUIPlugin[SidebarMethod]>;
      const extensions = fn(toFactoryArgs(pluginId)) || [];
      return extensions.map((ext) => ({ ...ext, pluginId }));
    },
  ).sort((a, b) => (a.order || 999) - (b.order || 999));
}

function resolveRouteExtensions(): ResolvedPluginExtension<RouteExtension>[] {
  return resolveExtensionsByMethod<RouteMethod, ResolvedPluginExtension<RouteExtension>>(
    "getRouteExtensions",
    (pluginId, _plugin, method) => {
      const fn = method as NonNullable<WebUIPlugin[RouteMethod]>;
      const extensions = fn(toFactoryArgs(pluginId)) || [];
      return extensions.map((ext) => ({ ...ext, pluginId }));
    },
  );
}

function resolveSettingsExtensions(): ResolvedPluginExtension<SettingsExtension>[] {
  return resolveExtensionsByMethod<SettingsMethod, ResolvedPluginExtension<SettingsExtension>>(
    "getSettingsExtensions",
    (pluginId, _plugin, method) => {
      const fn = method as NonNullable<WebUIPlugin[SettingsMethod]>;
      const extensions = fn(toFactoryArgs(pluginId)) || [];
      return extensions.map((ext) => ({ ...ext, pluginId }));
    },
  ).sort((a, b) => (a.order || 999) - (b.order || 999));
}

function refreshExtensionCache(): void {
  extensionCache.queryFilters = resolveQueryFilterExtensions();
  extensionCache.resultOptions = resolveResultOptionsExtensions();
  extensionCache.resultBatches = resolveResultBatchExtensions();
  extensionCache.resultRenderers = resolveResultRendererExtensions();
  extensionCache.sidebarItems = resolveSidebarMenuExtensions();
  extensionCache.routes = resolveRouteExtensions();
  extensionCache.settings = resolveSettingsExtensions();
  extensionCacheDirty = false;
}

function ensureExtensionCache(): void {
  if (extensionCacheDirty) {
    refreshExtensionCache();
  }
}

export function invalidatePluginExtensionCache(): void {
  extensionCacheDirty = true;
}

window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, invalidatePluginExtensionCache);

export function usePluginContext(pluginId = "host-app"): PluginContext {
  return createPluginContext(pluginId);
}

export function usePlugins(): WebUIPlugin[] {
  const [plugins, setPlugins] = useState<WebUIPlugin[]>([]);

  useEffect(() => {
    const update = () => {
      setPlugins(pluginRegistry.getAllPlugins());
    };

    update();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, update);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, update);
    };
  }, []);

  return plugins;
}

export function useEnabledPlugins(): WebUIPlugin[] {
  const [plugins, setPlugins] = useState<WebUIPlugin[]>([]);

  useEffect(() => {
    const updatePlugins = () => {
      setPlugins(pluginRegistry.getEnabledPlugins());
    };

    updatePlugins();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, updatePlugins);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, updatePlugins);
    };
  }, []);

  return plugins;
}

export function useDisabledPlugins(): WebUIPlugin[] {
  const [plugins, setPlugins] = useState<WebUIPlugin[]>([]);

  useEffect(() => {
    const updatePlugins = () => {
      setPlugins(pluginRegistry.getDisabledPlugins());
    };

    updatePlugins();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, updatePlugins);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, updatePlugins);
    };
  }, []);

  return plugins;
}

export function usePlugin(id: string): WebUIPlugin | undefined {
  const [plugin, setPlugin] = useState<WebUIPlugin | undefined>();

  useEffect(() => {
    const update = () => {
      setPlugin(pluginRegistry.getPlugin(id));
    };

    update();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, update);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, update);
    };
  }, [id]);

  return plugin;
}

export function usePluginState(id: string): PluginState | undefined {
  const [state, setState] = useState<PluginState | undefined>();

  useEffect(() => {
    const updateState = () => {
      setState(pluginRegistry.getPluginState(id));
    };

    updateState();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, updateState);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, updateState);
    };
  }, [id]);

  return state;
}

export function usePluginManagement() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePlugin = useCallback(async (pluginId: string, enable: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      if (enable) {
        await enablePlugin(pluginId);
      } else {
        await disablePlugin(pluginId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error occurred";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { togglePlugin, isLoading, error };
}

export function getQueryFilterExtensions(): ResolvedPluginExtension<QueryFilterExtension>[] {
  ensureExtensionCache();
  return extensionCache.queryFilters;
}

export function useQueryFilterExtensions(): ResolvedPluginExtension<QueryFilterExtension>[] {
  const [filters, setFilters] = useState<ResolvedPluginExtension<QueryFilterExtension>[]>([]);

  useEffect(() => {
    const update = () => {
      setFilters(getQueryFilterExtensions());
    };

    update();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, update);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, update);
    };
  }, []);

  return filters;
}

export function getResultOptionsExtensions(): ResolvedPluginExtension<ResultOptionsExtension>[] {
  ensureExtensionCache();
  return extensionCache.resultOptions;
}

export function useResultOptionsExtensions(): ResolvedPluginExtension<ResultOptionsExtension>[] {
  const [options, setOptions] = useState<ResolvedPluginExtension<ResultOptionsExtension>[]>([]);

  useEffect(() => {
    const update = () => {
      setOptions(getResultOptionsExtensions());
    };

    update();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, update);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, update);
    };
  }, []);

  return options;
}

export function invokeResultOptionAction(
  extension: ResolvedPluginExtension<ResultOptionsExtension>,
  result: Study,
  context: PluginContext,
): void | Promise<void> {
  return (extension.action as (args: ResultOptionActionArgs) => void | Promise<void>)({
    result,
    context,
    pluginId: extension.pluginId,
  });
}

export function getResultBatchExtensions(): ResolvedPluginExtension<ResultBatchExtension>[] {
  ensureExtensionCache();
  return extensionCache.resultBatches;
}

export function useResultBatchExtensions(): ResolvedPluginExtension<ResultBatchExtension>[] {
  const [batches, setBatches] = useState<ResolvedPluginExtension<ResultBatchExtension>[]>([]);

  useEffect(() => {
    const update = () => {
      setBatches(getResultBatchExtensions());
    };

    update();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, update);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, update);
    };
  }, []);

  return batches;
}

export function invokeResultBatchAction(
  extension: ResolvedPluginExtension<ResultBatchExtension>,
  results: Study[],
  context: PluginContext,
  options?: {
    searchResults?: import("@/types").SearchResult[];
    signal?: AbortSignal;
  },
): void | Promise<void> {
  return (extension.action as (args: ResultBatchActionArgs) => void | Promise<void>)({
    results,
    searchResults: options?.searchResults,
    context,
    pluginId: extension.pluginId,
    signal: options?.signal,
  });
}

export function getResultRendererExtensions(): ResolvedPluginExtension<ResultRendererExtension>[] {
  ensureExtensionCache();
  return extensionCache.resultRenderers;
}

export function useResultRendererExtensions(): ResolvedPluginExtension<ResultRendererExtension>[] {
  const [renderers, setRenderers] = useState<
    ResolvedPluginExtension<ResultRendererExtension>[]
  >([]);

  useEffect(() => {
    const update = () => {
      setRenderers(getResultRendererExtensions());
    };

    update();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, update);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, update);
    };
  }, []);

  return renderers;
}

export function getRouteExtensions(): RouteExtension[] {
  ensureExtensionCache();
  return extensionCache.routes;
}

export function useRouteExtensions(): RouteExtension[] {
  const [routes, setRoutes] = useState<RouteExtension[]>([]);

  useEffect(() => {
    const updateRoutes = () => {
      setRoutes(getRouteExtensions());
    };

    updateRoutes();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, updateRoutes);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, updateRoutes);
    };
  }, []);

  return routes;
}

export function getSidebarMenuExtensions(): SidebarMenuExtension[] {
  ensureExtensionCache();
  return extensionCache.sidebarItems;
}

export function useSidebarMenuExtensions(): SidebarMenuExtension[] {
  const [items, setItems] = useState<SidebarMenuExtension[]>([]);

  useEffect(() => {
    const updateItems = () => {
      setItems(getSidebarMenuExtensions());
    };

    updateItems();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, updateItems);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, updateItems);
    };
  }, []);

  return items;
}

export function getSettingsExtensions(): ResolvedPluginExtension<SettingsExtension>[] {
  ensureExtensionCache();
  return extensionCache.settings;
}

export function useSettingsExtensions(): ResolvedPluginExtension<SettingsExtension>[] {
  const [settings, setSettings] = useState<ResolvedPluginExtension<SettingsExtension>[]>([]);

  useEffect(() => {
    const update = () => {
      setSettings(getSettingsExtensions());
    };

    update();
    window.addEventListener(PLUGIN_STATE_CHANGED_EVENT, update);

    return () => {
      window.removeEventListener(PLUGIN_STATE_CHANGED_EVENT, update);
    };
  }, []);

  return settings;
}
