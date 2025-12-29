import { ReactNode } from "react";
import type { SearchResult, Study } from "@/types";
import type DicoogleClient from "dicoogle-client";

/**
 * Plugin Metadata
 * Basic information about a plugin
 */
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: string;
  dependencies?: string[]; // e.g., ["jszip@^3.10.1"]
}

/**
 * Plugin Configuration (from plugin.config.json)
 * Includes both technical config and metadata
 */
export interface PluginConfig {
  id: string;
  entry: string;
  enabled?: boolean;
  // Metadata can be in config file
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  type?: string;
  dependencies?: string[];
}

/**
 * Plugin Context
 * Provided to plugins during initialization
 */
export interface PluginContext {
  appVersion: string;
  logger: PluginLogger;
  storage: PluginStorage;
  eventBus: PluginEventBus;
  dicoogle: ReturnType<typeof DicoogleClient>;
  ui?: PluginUIHooks;
}

export interface PluginLogger {
  log: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, error?: any) => void;
  info: (message: string, data?: any) => void;
}

export interface PluginStorage {
  get: (key: string) => any;
  set: (key: string, value: any) => void;
  remove: (key: string) => void;
}

export interface PluginEventBus {
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string, callback: (data: any) => void) => void;
  emit: (event: string, data: any) => void;
}

export interface PluginUIHooks {
  showToast: (message: string, type: "success" | "error" | "info" | "warning") => void;
}

/**
 * Main Plugin Interface
 * All plugins must implement this interface
 */
export interface WebUIPlugin {
  // Metadata - can be in config file instead
  metadata?: PluginMetadata;

  // Lifecycle hooks
  init?: (context: PluginContext) => Promise<void> | void;
  destroy?: () => Promise<void> | void;

  // Extension methods (plugins implement what they need)
  getQueryFilterExtensions?: () => QueryFilterExtension[];
  getResultOptionsExtensions?: () => ResultOptionsExtension[];
  getResultBatchExtensions?: () => ResultBatchExtension[];
  getResultRendererExtensions?: () => ResultRendererExtension[];
  getSidebarMenuExtensions?: () => SidebarMenuExtension[];
  getRouteExtensions?: () => RouteExtension[];
  getSettingsExtensions?: () => SettingsExtension[];
}

/**
 * Query Filter Extension
 * Adds filtering UI to search page
 */
export interface QueryFilterExtension {
  id: string;
  label: string;
  description?: string;
  component: React.ComponentType<{
    value: any;
    onChange: (value: any) => void;
    context: PluginContext;
  }>;
  defaultValue: any;
  applyFilter?: (value: any) => string | null;
  order?: number;
}

/**
 * Result Options Extension
 * Adds action buttons to each search result
 */
export interface ResultOptionsExtension {
  id: string;
  label: string;
  icon: ReactNode;
  order?: number;
  condition?: (result: Study) => boolean;
  action: (result: Study, context: PluginContext) => void | Promise<void>;
}

/**
 * Result Batch Extension
 * Adds batch actions that work on multiple selected results
 */
export interface ResultBatchExtension {
  id: string;
  label: string;
  icon: ReactNode;
  order?: number;
  action: (results: Study[], context: PluginContext) => void | Promise<void>;
}

/**
 * Result Renderer Extension
 * Custom ways to display search results
 */
export interface ResultRendererExtension {
  id: string;
  name: string;
  icon: ReactNode;
  order?: number;
  component: React.ComponentType<{
    results: SearchResult[];
    loading: boolean;
    context: PluginContext;
    onResultSelect?: (result: SearchResult) => void;
  }>;
}

/**
 * Sidebar Menu Extension
 * Adds items to the main navigation menu
 */
export interface SidebarMenuExtension {
  id: string;
  label: string;
  icon?: ReactNode;
  path: string;
  order?: number;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
}

/**
 * Route Extension
 * Adds new routes/pages to the app
 */
export interface RouteExtension {
  path: string;
  component: React.ComponentType;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
}

/**
 * Settings Extension
 * Adds tabs to the Management/Settings page
 */
export interface SettingsExtension {
  id: string;
  label: string;
  icon?: ReactNode;
  component: React.ComponentType;
  order?: number;
}

/**
 * Plugin State
 * Tracks whether a plugin is enabled/disabled
 */
export interface PluginState {
  pluginId: string;
  enabled: boolean;
  lastModified: number;
}

/**
 * Plugin Registry Interface
 */
export interface PluginRegistry {
  registerPlugin: (plugin: WebUIPlugin) => void;
  getPlugin: (id: string) => WebUIPlugin | undefined;
  getAllPlugins: () => WebUIPlugin[];
  getEnabledPlugins: () => WebUIPlugin[];
  getDisabledPlugins: () => WebUIPlugin[];
  isPluginEnabled: (id: string) => boolean;
  setPluginEnabled: (id: string, enabled: boolean) => void;
  getPluginState: (id: string) => PluginState | undefined;
  getPluginsByType: <T extends keyof WebUIPlugin>(
    methodName: T
  ) => Array<{ plugin: WebUIPlugin; method: any }>;
}
