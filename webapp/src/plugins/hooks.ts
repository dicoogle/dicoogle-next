/**
 * Plugin Hooks and Context
 * Provides utilities for plugin interaction and React hooks
 */

import { useEffect, useState, useCallback } from 'react';
import { pluginRegistry } from './registry';
import {
  RouteExtension,
  SidebarMenuExtension,
  DashboardWidgetExtension,
  ContextMenuExtension,
  APIInterceptor,
  WebUIPlugin,
  PluginState,
} from './types';
import { enablePlugin, disablePlugin } from './manager';

/**
 * Hook to get all plugins (both enabled and disabled)
 */
export function usePlugins(): WebUIPlugin[] {
  const [plugins, setPlugins] = useState<WebUIPlugin[]>([]);

  useEffect(() => {
    setPlugins(pluginRegistry.getAllPlugins());
  }, []);

  return plugins;
}

/**
 * Hook to get only enabled plugins
 */
export function useEnabledPlugins(): WebUIPlugin[] {
  const [plugins, setPlugins] = useState<WebUIPlugin[]>([]);

  useEffect(() => {
    const updatePlugins = () => {
      setPlugins(pluginRegistry.getEnabledPlugins());
    };
    
    updatePlugins();
    window.addEventListener('plugin-state-changed', updatePlugins);
    
    return () => {
      window.removeEventListener('plugin-state-changed', updatePlugins);
    };
  }, []);

  return plugins;
}

/**
 * Hook to get only disabled plugins
 */
export function useDisabledPlugins(): WebUIPlugin[] {
  const [plugins, setPlugins] = useState<WebUIPlugin[]>([]);

  useEffect(() => {
    const updatePlugins = () => {
      setPlugins(pluginRegistry.getDisabledPlugins());
    };
    
    updatePlugins();
    window.addEventListener('plugin-state-changed', updatePlugins);
    
    return () => {
      window.removeEventListener('plugin-state-changed', updatePlugins);
    };
  }, []);

  return plugins;
}

/**
 * Hook to get a specific plugin by ID
 */
export function usePlugin(id: string): WebUIPlugin | undefined {
  const [plugin, setPlugin] = useState<WebUIPlugin | undefined>();

  useEffect(() => {
    setPlugin(pluginRegistry.getPlugin(id));
  }, [id]);

  return plugin;
}

/**
 * Hook to get plugin state (enabled/disabled)
 */
export function usePluginState(id: string): PluginState | undefined {
  const [state, setState] = useState<PluginState | undefined>();

  useEffect(() => {
    const updateState = () => {
      setState(pluginRegistry.getPluginState(id));
    };
    
    updateState();
    window.addEventListener('plugin-state-changed', updateState);
    
    return () => {
      window.removeEventListener('plugin-state-changed', updateState);
    };
  }, [id]);

  return state;
}

/**
 * Hook to enable/disable plugins
 */
export function usePluginManagement() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePlugin = useCallback(
    async (pluginId: string, enable: boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        if (enable) {
          await enablePlugin(pluginId);
        } else {
          await disablePlugin(pluginId);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error occurred';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { togglePlugin, isLoading, error };
}

/**
 * Get all route extensions from enabled plugins only
 */
export function getRouteExtensions(): RouteExtension[] {
  const routes: RouteExtension[] = [];

  const plugins = pluginRegistry.getEnabledPlugins();
  for (const plugin of plugins) {
    if (plugin.getRouteExtensions) {
      try {
        const pluginRoutes = plugin.getRouteExtensions();
        routes.push(...pluginRoutes);
      } catch (error) {
        console.error(
          `Error getting route extensions from plugin ${plugin.metadata.id}:`,
          error
        );
      }
    }
  }

  return routes;
}

/**
 * Hook to get all route extensions
 */
export function useRouteExtensions(): RouteExtension[] {
  const [routes, setRoutes] = useState<RouteExtension[]>([]);

  useEffect(() => {
    const updateRoutes = () => {
      setRoutes(getRouteExtensions());
    };
    
    updateRoutes();
    window.addEventListener('plugin-state-changed', updateRoutes);
    
    return () => {
      window.removeEventListener('plugin-state-changed', updateRoutes);
    };
  }, []);

  return routes;
}

/**
 * Get all sidebar menu extensions from enabled plugins only
 */
export function getSidebarMenuExtensions(): SidebarMenuExtension[] {
  const menuItems: SidebarMenuExtension[] = [];

  const plugins = pluginRegistry.getEnabledPlugins();
  for (const plugin of plugins) {
    if (plugin.getSidebarMenuExtensions) {
      try {
        const items = plugin.getSidebarMenuExtensions();
        menuItems.push(...items);
      } catch (error) {
        console.error(
          `Error getting sidebar menu extensions from plugin ${plugin.metadata.id}:`,
          error
        );
      }
    }
  }

  // Sort by order if provided
  return menuItems.sort((a, b) => (a.order || 999) - (b.order || 999));
}

/**
 * Hook to get all sidebar menu extensions
 */
export function useSidebarMenuExtensions(): SidebarMenuExtension[] {
  const [items, setItems] = useState<SidebarMenuExtension[]>([]);

  useEffect(() => {
    const updateItems = () => {
      setItems(getSidebarMenuExtensions());
    };
    
    updateItems();
    window.addEventListener('plugin-state-changed', updateItems);
    
    return () => {
      window.removeEventListener('plugin-state-changed', updateItems);
    };
  }, []);

  return items;
}

/**
 * Get all dashboard widget extensions from enabled plugins only
 */
export function getDashboardWidgetExtensions(): DashboardWidgetExtension[] {
  const widgets: DashboardWidgetExtension[] = [];

  const plugins = pluginRegistry.getEnabledPlugins();
  for (const plugin of plugins) {
    if (plugin.getDashboardWidgetExtensions) {
      try {
        const pluginWidgets = plugin.getDashboardWidgetExtensions();
        widgets.push(...pluginWidgets);
      } catch (error) {
        console.error(
          `Error getting dashboard widget extensions from plugin ${plugin.metadata.id}:`,
          error
        );
      }
    }
  }

  return widgets;
}

/**
 * Hook to get all dashboard widget extensions
 */
export function useDashboardWidgetExtensions(): DashboardWidgetExtension[] {
  const [widgets, setWidgets] = useState<DashboardWidgetExtension[]>([]);

  useEffect(() => {
    const updateWidgets = () => {
      setWidgets(getDashboardWidgetExtensions());
    };
    
    updateWidgets();
    window.addEventListener('plugin-state-changed', updateWidgets);
    
    return () => {
      window.removeEventListener('plugin-state-changed', updateWidgets);
    };
  }, []);

  return widgets;
}

/**
 * Get all API interceptors from enabled plugins only
 */
export function getAPIInterceptors(): APIInterceptor[] {
  const interceptors: APIInterceptor[] = [];

  const plugins = pluginRegistry.getEnabledPlugins();
  for (const plugin of plugins) {
    if (plugin.getAPIInterceptors) {
      try {
        const pluginInterceptors = plugin.getAPIInterceptors();
        interceptors.push(...pluginInterceptors);
      } catch (error) {
        console.error(
          `Error getting API interceptors from plugin ${plugin.metadata.id}:`,
          error
        );
      }
    }
  }

  return interceptors;
}

/**
 * Get all context menu extensions from enabled plugins only
 */
export function getContextMenuExtensions(): ContextMenuExtension[] {
  const menuItems: ContextMenuExtension[] = [];

  const plugins = pluginRegistry.getEnabledPlugins();
  for (const plugin of plugins) {
    if (plugin.getContextMenuExtensions) {
      try {
        const items = plugin.getContextMenuExtensions();
        menuItems.push(...items);
      } catch (error) {
        console.error(
          `Error getting context menu extensions from plugin ${plugin.metadata.id}:`,
          error
        );
      }
    }
  }

  return menuItems;
}

/**
 * Hook to get all context menu extensions
 */
export function useContextMenuExtensions(): ContextMenuExtension[] {
  const [items, setItems] = useState<ContextMenuExtension[]>([]);

  useEffect(() => {
    const updateItems = () => {
      setItems(getContextMenuExtensions());
    };
    
    updateItems();
    window.addEventListener('plugin-state-changed', updateItems);
    
    return () => {
      window.removeEventListener('plugin-state-changed', updateItems);
    };
  }, []);

  return items;
}
