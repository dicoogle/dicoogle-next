/**
 * Core plugin system types and interfaces
 * Defines the contract for WebUI plugins in dicoogle-next
 */

/**
 * Plugin metadata
 * Every plugin must provide this information
 */
export interface PluginMetadata {
  /** Unique identifier for the plugin */
  id: string;
  /** Display name of the plugin */
  name: string;
  /** Plugin version */
  version: string;
  /** Short description of what the plugin does */
  description: string;
  /** Author information */
  author?: string;
  /** Plugin license */
  license?: string;
}

/**
 * Route extension hook
 * Allows plugins to register new routes
 */
export interface RouteExtension {
  path: string;
  name: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

/**
 * Sidebar menu item extension
 * Allows plugins to add items to the sidebar navigation
 */
export interface SidebarMenuExtension {
  id: string;
  label: string;
  icon?: React.ReactNode;
  path: string;
  order?: number;
}

/**
 * Dashboard widget extension
 * Allows plugins to register dashboard widgets
 */
export interface DashboardWidgetExtension {
  id: string;
  title: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  defaultSize?: {
    width: number;
    height: number;
  };
}

/**
 * API interceptor extension
 * Allows plugins to intercept API calls
 */
export interface APIInterceptor {
  (request: APIRequest): APIRequest | Promise<APIRequest>;
}

export interface APIRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Context menu extension
 * Allows plugins to add context menu items
 */
export interface ContextMenuExtension {
  id: string;
  label: string;
  icon?: React.ReactNode;
  condition?: (context: any) => boolean;
  action: (context: any) => void | Promise<void>;
}

/**
 * Main plugin interface
 * All plugins must implement this interface
 */
export interface WebUIPlugin {
  /** Plugin metadata */
  metadata: PluginMetadata;

  /** Initialize the plugin with app context */
  init?: (context: PluginContext) => void | Promise<void>;

  /** Cleanup when plugin is unloaded or disabled */
  destroy?: () => void | Promise<void>;

  /** Register route extensions */
  getRouteExtensions?: () => RouteExtension[];

  /** Register sidebar menu extensions */
  getSidebarMenuExtensions?: () => SidebarMenuExtension[];

  /** Register dashboard widget extensions */
  getDashboardWidgetExtensions?: () => DashboardWidgetExtension[];

  /** Register API interceptors */
  getAPIInterceptors?: () => APIInterceptor[];

  /** Register context menu extensions */
  getContextMenuExtensions?: () => ContextMenuExtension[];
}

/**
 * Plugin state - tracks if a plugin is enabled or disabled
 */
export interface PluginState {
  pluginId: string;
  enabled: boolean;
  lastModified?: number;
}

/**
 * Context provided to plugins during initialization
 * Plugins can use this to interact with the app
 */
export interface PluginContext {
  /** App version */
  appVersion: string;

  /** Logger utility */
  logger: {
    log: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, error?: any) => void;
    info: (message: string, data?: any) => void;
  };

  /** Storage API */
  storage: {
    get: (key: string) => any;
    set: (key: string, value: any) => void;
    remove: (key: string) => void;
  };

  /** Event bus for plugin communication */
  eventBus: {
    on: (event: string, callback: (data: any) => void) => void;
    off: (event: string, callback: (data: any) => void) => void;
    emit: (event: string, data: any) => void;
  };
}

/**
 * Registry of all loaded plugins
 */
export interface PluginRegistry {
  plugins: Map<string, WebUIPlugin>;
  pluginStates: Map<string, PluginState>;
  registerPlugin: (plugin: WebUIPlugin) => void;
  getPlugin: (id: string) => WebUIPlugin | undefined;
  getAllPlugins: () => WebUIPlugin[];
  getEnabledPlugins: () => WebUIPlugin[];
  getDisabledPlugins: () => WebUIPlugin[];
  isPluginEnabled: (id: string) => boolean;
  setPluginEnabled: (id: string, enabled: boolean) => void;
  getPluginState: (id: string) => PluginState | undefined;
}
