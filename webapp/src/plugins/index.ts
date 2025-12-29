/**
 * Plugin System Module
 * Main entry point for the plugin system
 */

export * from './types';
export { pluginRegistry, PluginRegistry } from './registry';
export {
  usePlugins,
  useEnabledPlugins,
  useDisabledPlugins,
  usePlugin,
  usePluginState,
  usePluginManagement,
  getRouteExtensions,
  useRouteExtensions,
  getSidebarMenuExtensions,
  useSidebarMenuExtensions,
  getDashboardWidgetExtensions,
  useDashboardWidgetExtensions,
  getAPIInterceptors,
  getContextMenuExtensions,
  useContextMenuExtensions,
} from './hooks';
export {
  createPluginContext,
  initializePlugin,
  destroyPlugin,
  enablePlugin,
  disablePlugin,
  initializeAllPlugins,
  destroyAllPlugins,
} from './manager';

// Import and register discovered plugins from the existing loader
import { registerAllPlugins } from 'virtual:dicoogle-plugins';

// Register all discovered plugins using existing loader system
registerAllPlugins();
