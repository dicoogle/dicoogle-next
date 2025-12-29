/**
 * Core plugin system types and interfaces
 * Defines the contract for WebUI plugins in dicoogle-next
 */

import type DicoogleClient from 'dicoogle-client';
import { ReactNode } from 'react';

/**
 * Plugin types - defines where and how the plugin integrates
 */
export type PluginType = 
  | 'page'              // Full page route (default)
  | 'result-options'    // Action buttons on each search result row
  | 'result-batch'      // Bulk actions on selected results
  | 'menu'              // Sidebar menu item
  | 'settings'          // Settings page tab
  | 'query-filter'      // Query builder filters
  | 'result-renderer';  // Custom result list renderer

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
  /** Plugin type - determines where it hooks into the UI */
  type?: PluginType | PluginType[];
  /** Icon for the plugin (React component or icon name) */
  icon?: ReactNode | string;
  /** Caption/subtitle for settings or menu items */
  caption?: string;
}

/**
 * Route extension hook (type: 'page')
 * Allows plugins to register new full-page routes
 */
export interface RouteExtension {
  path: string;
  name: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

/**
 * Sidebar menu item extension (type: 'menu')
 * Allows plugins to add items to the sidebar navigation
 */
export interface SidebarMenuExtension {
  id: string;
  label: string;
  icon?: ReactNode;
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
 * Result options extension (type: 'result-options')
 * Adds action buttons to each search result row
 * Example: View, Download, Export, Send to PACS
 */
export interface ResultOptionsExtension {
  id: string;
  /** Button label */
  label: string;
  /** Button icon */
  icon?: ReactNode;
  /** 
   * Action to perform when clicked
   * Receives the DICOM result object
   */
  action: (result: any, context: PluginContext) => void | Promise<void>;
  /**
   * Optional condition to show/hide button
   * Return false to hide the button for this result
   */
  condition?: (result: any) => boolean;
  /** Button order (lower = appears first) */
  order?: number;
}

/**
 * Result batch extension (type: 'result-batch')
 * Adds bulk actions for multiple selected results
 * Example: Export All, Send All to PACS, Generate Report
 */
export interface ResultBatchExtension {
  id: string;
  /** Button label */
  label: string;
  /** Button icon */
  icon?: ReactNode;
  /**
   * Action to perform when clicked
   * Receives array of selected DICOM results
   */
  action: (results: any[], context: PluginContext) => void | Promise<void>;
  /**
   * Optional condition to enable/disable button
   * Return false to disable the button
   */
  enabled?: (results: any[]) => boolean;
  /** Button order (lower = appears first) */
  order?: number;
}

/**
 * Settings extension (type: 'settings')
 * Adds a new tab to the settings page
 */
export interface SettingsExtension {
  id: string;
  /** Tab label */
  label: string;
  /** Tab icon */
  icon?: ReactNode;
  /** Settings component */
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  /** Tab order */
  order?: number;
}

/**
 * Query filter extension (type: 'query-filter')
 * Adds custom filters to the search query builder
 * Example: Date range, Modality, Body part
 */
export interface QueryFilterExtension {
  id: string;
  /** Filter label */
  label: string;
  /** Filter component */
  component: React.LazyExoticComponent<React.ComponentType<QueryFilterProps>>;
  /** Default values */
  defaultValue?: any;
  /** Order in filter list */
  order?: number;
}

/**
 * Props passed to query filter components
 */
export interface QueryFilterProps {
  /** Current filter value */
  value: any;
  /** Callback when filter value changes */
  onChange: (value: any) => void;
  /** Plugin context */
  context: PluginContext;
}

/**
 * Result renderer extension (type: 'result-renderer')
 * Completely replaces the default result list with custom renderer
 * Example: Gallery view, Table view, Timeline view
 */
export interface ResultRendererExtension {
  id: string;
  /** Renderer name */
  name: string;
  /** Renderer icon */
  icon?: ReactNode;
  /** Result renderer component */
  component: React.LazyExoticComponent<React.ComponentType<ResultRendererProps>>;
}

/**
 * Props passed to result renderer components
 */
export interface ResultRendererProps {
  /** Search results */
  results: any[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error?: Error;
  /** Plugin context */
  context: PluginContext;
  /** Callback when result is selected */
  onResultSelect?: (result: any) => void;
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
  icon?: ReactNode;
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

  /** Register route extensions (type: 'page') */
  getRouteExtensions?: () => RouteExtension[];

  /** Register sidebar menu extensions (type: 'menu') */
  getSidebarMenuExtensions?: () => SidebarMenuExtension[];

  /** Register dashboard widget extensions */
  getDashboardWidgetExtensions?: () => DashboardWidgetExtension[];

  /** Register result option extensions (type: 'result-options') */
  getResultOptionsExtensions?: () => ResultOptionsExtension[];

  /** Register result batch extensions (type: 'result-batch') */
  getResultBatchExtensions?: () => ResultBatchExtension[];

  /** Register settings extensions (type: 'settings') */
  getSettingsExtensions?: () => SettingsExtension[];

  /** Register query filter extensions (type: 'query-filter') */
  getQueryFilterExtensions?: () => QueryFilterExtension[];

  /** Register result renderer extensions (type: 'result-renderer') */
  getResultRendererExtensions?: () => ResultRendererExtension[];

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

  /** Storage API (scoped to plugin) */
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

  /** Dicoogle client instance for backend communication */
  dicoogle: ReturnType<typeof DicoogleClient>;

  /** UI utilities */
  ui?: {
    /** Show a toast notification */
    showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
    /** Show a modal dialog */
    showModal: (component: ReactNode, options?: any) => void;
    /** Navigate to a route */
    navigate: (path: string) => void;
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
