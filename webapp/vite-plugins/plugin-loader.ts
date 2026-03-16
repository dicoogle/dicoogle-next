/**
 * Vite Plugin Loader
 * Generates plugin manifest and loader at buildtime
 * This plugin discovers all plugins in the plugins directory and generates code to load them
 */

import { Plugin } from "vite";
import fs from "fs";
import path from "path";

interface PluginConfig {
  id: string;
  entry: string;
  apiVersion?: string;
  enabled?: boolean;
  // Metadata fields
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  type?: string;
  dependencies?: string[];
}

interface DiscoveredPlugin {
  id: string;
  name: string;
  directoryName: string;
  path: string;
  entry: string;
  config: PluginConfig;
}

const SUPPORTED_API_VERSIONS = new Set(["1", "1.0"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePluginConfig(
  configPath: string,
  config: unknown,
  folderName: string,
): { config: PluginConfig; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(config)) {
    return {
      config: { id: folderName, entry: "index.ts" },
      errors: [`Invalid config at ${configPath}: expected a JSON object`],
      warnings,
    };
  }

  const normalized: PluginConfig = {
    id: typeof config.id === "string" ? config.id.trim() : folderName,
    entry: typeof config.entry === "string" ? config.entry.trim() : "index.ts",
    apiVersion:
      typeof config.apiVersion === "string" ? config.apiVersion.trim() : undefined,
    enabled: typeof config.enabled === "boolean" ? config.enabled : undefined,
    name: typeof config.name === "string" ? config.name : undefined,
    version: typeof config.version === "string" ? config.version : undefined,
    description:
      typeof config.description === "string" ? config.description : undefined,
    author: typeof config.author === "string" ? config.author : undefined,
    type: typeof config.type === "string" ? config.type : undefined,
    dependencies: Array.isArray(config.dependencies)
      ? config.dependencies.filter((dep): dep is string => typeof dep === "string")
      : undefined,
  };

  if (!normalized.id) {
    errors.push(`Invalid config at ${configPath}: "id" must be a non-empty string`);
  }

  if (!normalized.entry) {
    errors.push(`Invalid config at ${configPath}: "entry" must be a non-empty string`);
  }

  if (normalized.entry.startsWith("/") || normalized.entry.includes("..")) {
    errors.push(
      `Invalid config at ${configPath}: "entry" must be relative and cannot contain ".."`,
    );
  }

  if (normalized.dependencies && normalized.dependencies.includes(normalized.id)) {
    errors.push(
      `Invalid config at ${configPath}: plugin cannot depend on itself (${normalized.id})`,
    );
  }

  if (normalized.apiVersion && !SUPPORTED_API_VERSIONS.has(normalized.apiVersion)) {
    warnings.push(
      `Plugin ${normalized.id} declares unsupported apiVersion "${normalized.apiVersion}"`,
    );
  }

  const knownKeys = new Set([
    "id",
    "entry",
    "apiVersion",
    "enabled",
    "name",
    "version",
    "description",
    "author",
    "type",
    "dependencies",
  ]);

  Object.keys(config).forEach((key) => {
    if (!knownKeys.has(key)) {
      warnings.push(`Plugin ${normalized.id} has unknown config key "${key}"`);
    }
  });

  return { config: normalized, errors, warnings };
}

/**
 * Discover plugins by looking for plugin.config.json files
 * in the plugins directory
 */
function discoverPlugins(pluginsDir: string): DiscoveredPlugin[] {
  const discovered: DiscoveredPlugin[] = [];
  const discoveredIds = new Set<string>();

  if (!fs.existsSync(pluginsDir)) {
    console.warn(`Plugins directory not found at ${pluginsDir}`);
    return discovered;
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const configPath = path.join(pluginsDir, entry.name, "plugin.config.json");

    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, "utf-8");
        const parsedConfig = JSON.parse(configContent);
        const { config, errors, warnings } = validatePluginConfig(
          configPath,
          parsedConfig,
          entry.name,
        );

        for (const warning of warnings) {
          console.warn(warning);
        }

        if (errors.length > 0) {
          for (const err of errors) {
            console.error(err);
          }
          continue;
        }

        if (discoveredIds.has(config.id)) {
          console.error(
            `Duplicate plugin id "${config.id}" detected at ${configPath}. Skipping duplicate.`,
          );
          continue;
        }

        const pluginEntry = path.join(
          pluginsDir,
          entry.name,
          config.entry || "index.ts",
        );

        if (fs.existsSync(pluginEntry)) {
          discoveredIds.add(config.id);
          discovered.push({
            id: config.id || entry.name,
            name: entry.name,
            directoryName: entry.name,
            path: pluginEntry,
            entry: config.entry || "index.ts",
            config,
          });
        } else {
          console.warn(
            `Plugin entry not found at ${pluginEntry} for plugin ${entry.name}`,
          );
        }
      } catch (error) {
        console.error(`Error loading plugin config at ${configPath}:`, error);
      }
    }
  }

  const discoveredById = new Set(discovered.map((plugin) => plugin.id));

  for (const plugin of discovered) {
    for (const depId of plugin.config.dependencies || []) {
      if (!discoveredById.has(depId)) {
        console.error(
          `Plugin ${plugin.id} depends on missing plugin "${depId}". It may fail to initialize.`,
        );
      }
    }
  }

  const pluginMap = new Map(discovered.map((plugin) => [plugin.id, plugin]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const detectCycle = (pluginId: string, trace: string[]) => {
    if (visited.has(pluginId)) {
      return;
    }
    if (visiting.has(pluginId)) {
      console.error(`Plugin dependency cycle detected: ${[...trace, pluginId].join(" -> ")}`);
      return;
    }

    visiting.add(pluginId);
    const plugin = pluginMap.get(pluginId);
    const dependencies = plugin?.config.dependencies || [];
    for (const depId of dependencies) {
      if (pluginMap.has(depId)) {
        detectCycle(depId, [...trace, pluginId]);
      }
    }
    visiting.delete(pluginId);
    visited.add(pluginId);
  };

  for (const plugin of discovered) {
    detectCycle(plugin.id, []);
  }

  return discovered;
}

/**
 * Generate the plugins loader code
 * This creates a virtual module that imports all discovered plugins
 */
function generatePluginLoaderCode(plugins: DiscoveredPlugin[]): string {
  let code = `/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Generated by vite-plugin-loader at buildtime
 * This file imports and registers all discovered plugins
 */

import { pluginRegistry } from '@/plugin-system/registry';
`;

  // Generate imports
  plugins.forEach((plugin, index) => {
    const importPath = plugin.path.replace(/\\/g, "/");
    code += `import Plugin${index} from '${importPath}';
`;
  });

  code += `
/**
 * Register all plugins with the registry
 */
export function registerAllPlugins() {
`;

  // Generate registration code with config metadata and default enabled state
  plugins.forEach((plugin, index) => {
    const configMetadata = JSON.stringify({
      id: plugin.config.id,
      apiVersion: plugin.config.apiVersion,
      name: plugin.config.name,
      version: plugin.config.version,
      description: plugin.config.description,
      author: plugin.config.author,
      type: plugin.config.type,
      dependencies: plugin.config.dependencies,
    });

    // Default to enabled unless explicitly set to false
    const defaultEnabled = plugin.config.enabled !== false;

    code += `  try {
    // Pass config metadata and default enabled state to registry
    pluginRegistry.registerPlugin(Plugin${index}, ${configMetadata}, ${defaultEnabled});
  } catch (error) {
    console.error('Failed to register plugin ${plugin.id}:', error);
  }
`;
  });

  code += `}

/**
 * Export list of discovered plugins for debugging
 */
export const discoveredPlugins = [
`;

  plugins.forEach((plugin) => {
    code += `  { id: '${plugin.id}', name: '${plugin.name}', directory: '${plugin.directoryName}', entry: '${plugin.entry}', defaultEnabled: ${plugin.config.enabled !== false} },
`;
  });

  code += `];

export default { registerAllPlugins, discoveredPlugins };
`;

  return code;
}

/**
 * Vite Plugin for loading plugins at buildtime
 */
export function createPluginLoader(): Plugin {
  const VIRTUAL_MODULE_ID = "virtual:dicoogle-plugins";
  const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

  let pluginsDir = "";
  let discoveredPlugins: DiscoveredPlugin[] = [];

  return {
    name: "dicoogle-plugin-loader",

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return generatePluginLoaderCode(discoveredPlugins);
      }
    },

    configResolved(config) {
      // Resolve plugins directory relative to project root
      pluginsDir = path.resolve(config.root || process.cwd(), "src", "plugins");
      discoveredPlugins = discoverPlugins(pluginsDir);

      if (discoveredPlugins.length > 0) {
        console.log(
          `\n✓ Plugin Loader: Discovered ${discoveredPlugins.length} plugin(s)`,
        );
        discoveredPlugins.forEach((plugin) => {
          const displayName = plugin.config.name || plugin.id;
          const version = plugin.config.version || "?";
          const enabled = plugin.config.enabled !== false ? "✓" : "✗";
          console.log(`  ${enabled} ${displayName} v${version} (${plugin.id})`);
        });
        console.log("");
      }
    },
  };
}

export default createPluginLoader;
