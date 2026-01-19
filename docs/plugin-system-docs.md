# Dicoogle-Next Build-Time WebUI Plugin System Documentation

## Architecture Overview

The plugin system uses a **build-time discovery and registration approach** where plugins are automatically discovered during the Vite build process and bundled into the application.

### Core Components

The system consists of three main layers:

1. **Vite Plugin Loader** (`vite-plugins/plugin-loader.ts`) - Build-time discovery
2. **Plugin System** (`src/plugin-system/`) - Runtime management
3. **Plugin Implementations** (`src/plugins/`) - Individual plugins

---

## Build-Time Discovery System

### Plugin Loader (`vite-plugins/plugin-loader.ts`)

The Vite plugin creates a virtual module that automatically discovers and imports all plugins at build time.

**Discovery Process:**

1. Scans `src/plugins` directory for subdirectories
2. Looks for `plugin.config.json` in each subdirectory
3. Validates configuration and checks for entry file existence
4. Generates import statements and registration code
5. Creates virtual module `virtual:dicoogle-plugins`

**Key Features:**

- Automatic discovery - no manual plugin registration needed
- Type-safe imports at build time
- Compile-time validation of plugin structure
- Console output showing discovered plugins with versions and enabled state

**Configuration in `vite.config.ts`:**

```typescript
import { createPluginLoader } from "./vite-plugins/plugin-loader";

export default defineConfig({
  plugins: [createPluginLoader()],
});
```

**Generated Virtual Module:**

The plugin loader generates code that exports:

- `registerAllPlugins()` - Function to register all discovered plugins
- `discoveredPlugins` - Array of plugin metadata for debugging

---

## Plugin Configuration

### `plugin.config.json` Schema

Each plugin requires a configuration file in its directory:

```json
{
  "id": "unique-plugin-id",
  "entry": "index.ts",
  "enabled": true,
  "name": "Display Name",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": "Author Name",
  "type": "extension-type",
  "dependencies": []
}
```

**Required Fields:**

- `id` - Unique identifier for the plugin
- `entry` - Entry file path (defaults to `index.ts`)
- `type` - Plugin category

**Optional Metadata:**

- `enabled` - Default enabled state (defaults to `true`)
- `name`, `version`, `description`, `author` - Display metadata
- `dependencies` - Array of required plugin IDs

### Example Configurations

**Minimal Configuration:**

```json
{
  "id": "my-plugin",
  "entry": "index.ts"
}
```

**Full Configuration:**

```json
{
  "id": "download-plugin",
  "entry": "index.tsx",
  "enabled": true,
  "name": "Download Plugin",
  "version": "1.0.0",
  "description": "Download DICOM studies as ZIP files",
  "author": "Dicoogle Team",
  "type": "result-action",
  "dependencies": ["authentication-plugin"]
}
```

---

## Plugin System Runtime

### Plugin Registry (`src/plugin-system/registry.ts`)

Central registry managing all plugins with state persistence.

**Key Features:**

- Plugin registration with merged metadata
- Enable/disable state management
- LocalStorage persistence with versioning
- Duplicate ID detection
- Query plugins by type/method

**Important Methods:**

```typescript
// Register a plugin
registerPlugin(plugin, configMetadata, defaultEnabled);

// Query plugins
getPlugin(id); // Get specific plugin
getAllPlugins(); // Get all plugins
getEnabledPlugins(); // Get enabled only
getDisabledPlugins(); // Get disabled only
getPluginsByType(methodName); // Get plugins implementing method

// State management
isPluginEnabled(id); // Check if enabled
setPluginEnabled(id, enabled); // Toggle plugin state
getPluginState(id); // Get plugin state object
```

**State Management:**

Plugin states are persisted in localStorage with key `dicoogle_plugin_states`. The system uses versioning to invalidate old state formats when the system changes.

```typescript
interface PluginState {
  pluginId: string;
  enabled: boolean;
  lastModified: number;
}
```

**LocalStorage Format:**

```javascript
// Key: dicoogle_plugin_states
{
  "hello-plugin": {
    "pluginId": "hello-plugin",
    "enabled": true,
    "lastModified": 1705516800000
  },
  "download-plugin": {
    "pluginId": "download-plugin",
    "enabled": true,
    "lastModified": 1705516800000
  }
}
```

### Plugin Manager (`src/plugin-system/manager.ts`)

Handles plugin lifecycle and initialization.

**Core Functions:**

#### 1. `createPluginContext(pluginId)`

Creates context object for plugins with scoped utilities:

```typescript
interface PluginContext {
  appVersion: string;
  logger: PluginLogger; // Scoped console logging
  storage: PluginStorage; // Plugin-scoped localStorage
  eventBus: PluginEventBus; // Custom event system
  dicoogle: DicoogleClient; // API client instance
  ui?: PluginUIHooks; // UI utilities (toasts)
}
```

**Logger** - Automatically prefixes logs with plugin ID:

```typescript
context.logger.log(message, data);
context.logger.warn(message, data);
context.logger.error(message, error);
context.logger.info(message, data);

// Console output: [Plugin:my-plugin] Log message
```

**Storage** - Plugin-scoped localStorage (keys automatically prefixed):

```typescript
context.storage.get(key); // Read value
context.storage.set(key, value); // Write value
context.storage.remove(key); // Delete value

// Example: storage.set("theme", "dark")
// Actually stores: plugin_my-plugin_theme → "dark"
```

**Event Bus** - Custom event system for inter-plugin communication:

```typescript
context.eventBus.on(event, callback)    // Subscribe to event
context.eventBus.off(event, callback)   // Unsubscribe
context.eventBus.emit(event, data)      // Emit event

// Example: Emit when analysis completes
context.eventBus.emit("analysis-complete", { results: [...] })

// Another plugin listens
context.eventBus.on("analysis-complete", (data) => {
  console.log("Analysis done:", data.results)
})
```

**Dicoogle Client** - Pre-configured API client with shared authentication:

```typescript
context.dicoogle.search(query); // Search DICOM studies
context.dicoogle.getBase(); // Get API base URL
context.dicoogle.setToken(token); // Set authentication token
```

**UI Utilities** - User feedback:

```typescript
context.ui?.showToast(message, type); // Show notification
// Types: "success" | "error" | "info" | "warning"
```

#### 2. `initializePlugin(pluginId, context)`

Initialize single plugin:

- Calls plugin's `init()` hook
- Tracks initialization state
- Handles errors gracefully

```typescript
try {
  await initializePlugin("my-plugin");
  // Console: ✓ Plugin initialized: My Plugin
} catch (error) {
  console.error("Initialization failed:", error);
}
```

#### 3. `destroyPlugin(pluginId)`

Cleanup plugin resources:

- Calls plugin's `destroy()` hook
- Removes from initialized set
- Handles cleanup errors

```typescript
await destroyPlugin("my-plugin");
// Console: ✓ Plugin destroyed: My Plugin
```

#### 4. `enablePlugin(pluginId)` / `disablePlugin(pluginId)`

Toggle plugin state with full lifecycle:

- Updates registry state
- Triggers lifecycle hooks
- Emits `plugin-state-changed` event

```typescript
await enablePlugin("my-plugin"); // Initialize and enable
await disablePlugin("my-plugin"); // Destroy and disable

// Event fired for re-rendering
window.dispatchEvent(
  new CustomEvent("plugin-state-changed", {
    detail: { pluginId, enabled: true },
  }),
);
```

#### 5. `initializeAllPlugins()`

Batch initialization of all enabled plugins:

```typescript
await initializeAllPlugins();
// Console output:
// 🔌 Initializing 4 enabled plugin(s)...
// ✓ Plugin initialized: Hello Plugin
// ✓ Plugin initialized: Download Plugin
// ✓ Plugin initialized: Gallery View
// ✓ Plugin initialized: Date Filter
```

---

## Plugin Interface

### WebUIPlugin Type

All plugins must implement the `WebUIPlugin` interface:

```typescript
interface WebUIPlugin {
  metadata?: PluginMetadata;

  // Lifecycle hooks
  init?(context: PluginContext): Promise<void> | void;
  destroy?(): Promise<void> | void;

  // Extension methods (implement as needed)
  getQueryFilterExtensions?(): QueryFilterExtension[];
  getResultOptionsExtensions?(): ResultOptionsExtension[];
  getResultRendererExtensions?(): ResultRendererExtension[];
  getSidebarMenuExtensions?(): SidebarMenuExtension[];
  getRouteExtensions?(): RouteExtension[];
  getSettingsExtensions?(): SettingsExtension[];
}
```

### Lifecycle Hooks

#### `init(context)`

Called when plugin is loaded and enabled.

```typescript
init: async (context: PluginContext) => {
  // Initialize plugin state
  context.logger.info("Plugin starting up");

  // Load user preferences
  const prefs = context.storage.get("preferences") || {};

  // Setup event listeners
  context.eventBus.on("app-ready", () => {
    context.logger.info("App is ready");
  });

  // Query API if needed
  const studies = await context.dicoogle.search("PatientName:*");
  context.logger.info(`Found ${studies.results.length} studies`);
};
```

#### `destroy()`

Called when plugin is disabled or app shuts down.

```typescript
destroy: async () => {
  // Cleanup resources
  // Remove event listeners
  // Stop timers
  // Save state
  console.log("Plugin cleanup complete");
};
```

### Extension Types

#### 1. Query Filter Extension

Adds filtering UI to search page:

```typescript
interface QueryFilterExtension {
  id: string; // Unique ID
  label: string; // Filter label
  description?: string; // Help text
  component: React.ComponentType<QueryFilterProps>;
  defaultValue: any; // Initial value
  applyFilter?(value: any): string | null; // Convert to Dicoogle query
  order?: number; // Sort order (lower = first)
}

interface QueryFilterProps {
  value: any;
  onChange: (value: any) => void;
  context: PluginContext;
}
```

**Example:** Date range filter

```typescript
getQueryFilterExtensions: () => [
  {
    id: "date-filter",
    label: "Study Date",
    description: "Filter by study date range",
    component: DateRangeFilter,
    defaultValue: { from: null, to: null },
    applyFilter: (value) => {
      if (!value.from || !value.to) return null;
      return `StudyDate:[${value.from} TO ${value.to}]`;
    },
    order: 10,
  },
];
```

#### 2. Result Options Extension

Adds action buttons to individual search results:

```typescript
interface ResultOptionsExtension {
  id: string; // Unique ID
  label: string; // Button label
  icon: ReactNode; // Button icon
  order?: number; // Sort order
  condition?: (result: Study) => boolean; // Show if true
  action(result: Study, context: PluginContext): void | Promise<void>;
}
```

**Example:** Download button

```typescript
getResultOptionsExtensions: () => [{
  id: "download",
  label: "Download",
  icon: <Download className="w-4 h-4" />,
  order: 20,
  condition: (result) => result.studyInstanceUID !== undefined,
  action: async (result, context) => {
    context.logger.info("Downloading:", result.patientName)
    // Download logic...
    context.ui?.showToast("Download started", "success")
  },
}]
```

#### 3. Result Renderer Extension

Custom display modes for search results:

```typescript
interface ResultRendererExtension {
  id: string; // Unique ID
  name: string; // Display name
  icon: ReactNode; // Tab icon
  order?: number; // Sort order
  component: React.ComponentType<ResultRendererProps>;
}

interface ResultRendererProps {
  results: SearchResult[];
  loading: boolean;
  context: PluginContext;
  onResultSelect?: (result: SearchResult) => void;
}
```

**Example:** Gallery view

```typescript
getResultRendererExtensions: () => [{
  id: "gallery",
  name: "Gallery",
  icon: <Grid className="w-4 h-4" />,
  component: GalleryViewComponent,
}]
```

#### 4. Sidebar Menu Extension

Adds navigation menu items:

```typescript
interface SidebarMenuExtension {
  id: string; // Unique ID
  label: string; // Menu label
  icon?: ReactNode; // Menu icon
  path: string; // Route path
  order?: number; // Sort order
  requiresAuth?: boolean; // Auth required
  requiresAdmin?: boolean; // Admin required
}
```

**Example:** Analytics menu item

```typescript
getSidebarMenuExtensions: () => [{
  id: "analytics",
  label: "Analytics",
  icon: <BarChart className="w-4 h-4" />,
  path: "/plugins/analytics",
  order: 50,
  requiresAuth: true,
}]
```

#### 5. Route Extension

Adds new pages/routes to the application:

```typescript
interface RouteExtension {
  path: string; // Route path
  name: string; // Route name
  component: React.ComponentType; // Page component
  requiresAuth?: boolean; // Auth required
  requiresAdmin?: boolean; // Admin required
}
```

**Example:** Analytics page

```typescript
getRouteExtensions: () => [
  {
    path: "/plugins/analytics",
    name: "Analytics",
    component: AnalyticsPage,
    requiresAuth: true,
  },
];
```

#### 6. Settings Extension

Adds tabs to the Management/Settings page:

```typescript
interface SettingsExtension {
  id: string; // Unique ID
  label: string; // Tab label
  icon?: ReactNode; // Tab icon
  component: React.ComponentType; // Settings form component
  order?: number; // Sort order
}
```

**Example:** Plugin settings tab

```typescript
getSettingsExtensions: () => [{
  id: "plugin-settings",
  label: "Plugin Config",
  icon: <Settings className="w-4 h-4" />,
  component: PluginSettingsForm,
  order: 10,
}]
```

---

## React Hooks (`src/plugin-system/hooks.ts`)

The system provides React hooks for plugin interaction in host application components.

### Plugin Queries

#### `usePlugins()`

Get all plugins (enabled and disabled):

```typescript
function MyComponent() {
  const plugins = usePlugins()

  return (
    <div>
      {plugins.map(plugin => (
        <div key={plugin.metadata?.id}>
          {plugin.metadata?.name}
        </div>
      ))}
    </div>
  )
}
```

#### `useEnabledPlugins()`

Get only enabled plugins:

```typescript
function PluginList() {
  const plugins = useEnabledPlugins()

  return (
    <ul>
      {plugins.map(p => <li key={p.metadata?.id}>{p.metadata?.name}</li>)}
    </ul>
  )
}
```

#### `useDisabledPlugins()`

Get only disabled plugins:

```typescript
function DisabledPlugins() {
  const plugins = useDisabledPlugins()
  return <div>Disabled: {plugins.length}</div>
}
```

#### `usePlugin(id)`

Get specific plugin by ID:

```typescript
function PluginDetail({ pluginId }: { pluginId: string }) {
  const plugin = usePlugin(pluginId)

  return plugin ? (
    <div>{plugin.metadata?.name}</div>
  ) : (
    <div>Plugin not found</div>
  )
}
```

### State Management

#### `usePluginState(id)`

Get plugin enabled/disabled state:

```typescript
function PluginStatus({ pluginId }: { pluginId: string }) {
  const state = usePluginState(pluginId)

  return (
    <div>
      Status: {state?.enabled ? "Enabled" : "Disabled"}
    </div>
  )
}
```

#### `usePluginManagement()`

Get functions to enable/disable plugins with error handling:

```typescript
function PluginToggle({ pluginId }: { pluginId: string }) {
  const { togglePlugin, isLoading, error } = usePluginManagement()

  const handleToggle = async (enable: boolean) => {
    try {
      await togglePlugin(pluginId, enable)
    } catch (err) {
      console.error("Failed to toggle plugin:", err)
    }
  }

  return (
    <div>
      <button
        onClick={() => handleToggle(true)}
        disabled={isLoading}
      >
        {isLoading ? "Loading..." : "Enable"}
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  )
}
```

### Extension Queries

#### `useRouteExtensions()`

Get all route extensions from enabled plugins:

```typescript
import { useRouteExtensions } from '@/plugin-system/hooks'

function App() {
  const routes = useRouteExtensions()

  return (
    <Routes>
      {routes.map(route => (
        <Route
          key={route.path}
          path={route.path}
          element={<route.component />}
        />
      ))}
    </Routes>
  )
}
```

#### `useSidebarMenuExtensions()`

Get all sidebar menu items from enabled plugins:

```typescript
import { useSidebarMenuExtensions } from '@/plugin-system/hooks'

function Sidebar() {
  const menuItems = useSidebarMenuExtensions()

  return (
    <nav>
      {menuItems.map(item => (
        <Link key={item.id} to={item.path}>
          {item.icon} {item.label}
        </Link>
      ))}
    </nav>
  )
}
```

### Utility

#### `usePluginContext()`

Create plugin context object (for custom plugin components):

```typescript
function CustomComponent() {
  const context = usePluginContext()

  useEffect(() => {
    context.logger.info("Component mounted")
    context.eventBus.emit("custom-event", { data: "value" })
  }, [])

  return <div>Using plugin context</div>
}
```

### Hook Re-render Behavior

All hooks automatically re-render when `plugin-state-changed` events fire, keeping UI synchronized with plugin state.

---

## Example Plugins

### 1. Hello Plugin (Basic Route + Menu)

[plugin.config.json](./Examples/hello-plugin/plugin.config.json)

[index.ts](./Examples/hello-plugin/index.ts)

[HelloComponent.tsx](./Examples/hello-plugin/HelloComponent.tsx)

---

### 2. Download Plugin (Result Options)

Demonstrates adding action buttons to search results:

[plugin.config.json](./Examples/download-plugin/plugin.config.json)

[index.tsx](./Examples/download-plugin/index.tsx)

---

### 3. Gallery View Plugin (Result Renderer)

Adds alternative visualization for search results:

[plugin.config.json](./Examples/gallery-view-plugin/plugin.config.json)

[index.tsx](./Examples/gallery-view-plugin/index.tsx)

### Others

You can check other plugin types on the [Examples](./Examples/) directory

---

## Creating New Plugins

### Step-by-Step Guide

**Step 1: Create plugin directory**

```bash
mkdir src/plugins/my-plugin
cd src/plugins/my-plugin
```

**Step 2: Create `plugin.config.json`**

```json
{
  "id": "my-plugin",
  "entry": "index.ts",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "My custom plugin",
  "author": "Your Name"
}
```

**Step 3: Create `index.ts`**

```typescript
import { WebUIPlugin, PluginContext } from "@/plugin-system";

const myPlugin: WebUIPlugin = {
  init: async (context: PluginContext) => {
    context.logger.info("Plugin initialized");
  },

  destroy: async () => {
    console.log("Plugin destroyed");
  },

  // Implement extension methods as needed
  getSidebarMenuExtensions: () => [],
  getRouteExtensions: () => [],
};

export default myPlugin;
```

**Step 4: Build and run**

```bash
npm run dev
```

The plugin will be automatically discovered and registered.

**Expected console output:**

```
✓ Plugin Loader: Discovered 6 plugin(s)
  ✓ My Plugin v1.0.0 (my-plugin)
  ✓ Hello Plugin v1.0.0 (hello-plugin)
  ✓ Download Plugin v1.0.0 (download-plugin)
  ...
```

### Plugin Template (Minimal)

```typescript
import { WebUIPlugin, PluginContext } from "@/plugin-system";

const myPlugin: WebUIPlugin = {
  metadata: {
    id: "my-plugin",
    name: "My Plugin",
    version: "1.0.0",
    description: "Plugin description",
    author: "Your Name",
    type: "extension",
  },

  init: async (context: PluginContext) => {
    context.logger.info("Initializing plugin");
    // Setup code here
  },

  destroy: async () => {
    // Cleanup code here
  },

  // Implement extension methods you need
  getSidebarMenuExtensions: () => [],
  getRouteExtensions: () => [],
  getResultOptionsExtensions: () => [],
  getQueryFilterExtensions: () => [],
};

export default myPlugin;
```

---

## Plugin Lifecycle

### Build Time

1. Vite plugin scans `src/plugins/`
2. Reads `plugin.config.json` files
3. Generates virtual module with imports
4. Bundles plugins into application

### Application Startup

1. Virtual module imported in `main.tsx`
2. `registerAllPlugins()` called
3. Plugins registered in registry
4. `initializeAllPlugins()` called
5. `init()` hooks executed for enabled plugins

### Runtime

1. Extension methods queried by host application
2. Components rendered when needed
3. Actions executed on user interaction

### Enable/Disable

1. User toggles plugin in settings
2. `enablePlugin()` or `disablePlugin()` called
3. Lifecycle hooks executed
4. `plugin-state-changed` event fired
5. React components re-render

---

## Storage & Persistence

### Plugin Storage (Per-Plugin)

Each plugin gets isolated storage scoped by plugin ID:

```typescript
// Plugin stores data with key "theme"
context.storage.set("theme", "dark");
// Stored as: plugin_my-plugin_theme → "dark"

// Another plugin can also use key "theme" without conflicts
// Stored as: plugin_other-plugin_theme → "light"
```

### Registry State (Global)

Plugin enabled/disabled states stored in global registry:

```javascript
// LocalStorage key: dicoogle_plugin_states
{
  "my-plugin": {
    "pluginId": "my-plugin",
    "enabled": true,
    "lastModified": 1705516800000
  }
}
```

### Clearing State

The registry automatically clears old state when version changes:

```typescript
const CURRENT_VERSION = "1.0"; // Increment to force clear
```

Manual clearing:

```javascript
// In browser console
localStorage.removeItem("dicoogle_plugin_states");
localStorage.removeItem("dicoogle_plugin_version");
```

---

## Integration

1. **Use provided context** rather than importing services directly

   ```typescript
   // ✅ Good
   const client = context.dicoogle;

   // ❌ Avoid
   import { dicoogleService } from "@/services";
   ```

2. **Emit custom events** via eventBus for inter-plugin communication

   ```typescript
   context.eventBus.emit("analysis-complete", { results: [...] })
   ```

3. **Store preferences** in context.storage for persistence

   ```typescript
   const prefs = context.storage.get("user-prefs");
   context.storage.set("user-prefs", updatedPrefs);
   ```

4. **Use dicoogle client** from context for API calls

   ```typescript
   const studies = await context.dicoogle.search(query);
   ```

5. **Provide feedback to users**

   ```typescript
   context.ui?.showToast("Action completed", "success");
   context.ui?.showToast("An error occurred", "error");
   ```

---

## Troubleshooting

### Plugin Not Discovered

**Problem:** Plugin doesn't appear in build output

**Solutions:**

1. Ensure `plugin.config.json` is valid JSON

   ```bash
   cat src/plugins/my-plugin/plugin.config.json | jq .
   ```

2. Check plugin ID exists and is unique

   ```json
   {
     "id": "my-plugin" // Must be present
   }
   ```

3. Verify entry file exists

   ```bash
   ls -la src/plugins/my-plugin/index.ts
   ```

4. Rebuild Vite

   ```bash
   npm run dev
   ```

### Plugin Not Initializing

**Problem:** Plugin registered but init hook not called

**Solutions:**

1. Check if plugin is enabled

   ```typescript
   const enabled = pluginRegistry.isPluginEnabled("my-plugin");
   ```

2. Check browser console for errors
3. Ensure `init()` hook is defined or doesn't throw

### Plugin Storage Not Working

**Problem:** Storage get/set not persisting

**Solutions:**

1. Check localStorage is enabled

   ```javascript
   localStorage.setItem("test", "value");
   localStorage.getItem("test");
   ```

2. Check key names in DevTools

   ```javascript
   Object.keys(localStorage).filter((k) => k.includes("plugin"));
   ```

3. Clear old state if needed

   ```javascript
   localStorage.clear();
   ```

### Extension Not Showing

**Problem:** Extension method results not appearing in UI

**Solutions:**

1. Verify plugin is enabled
2. Check extension method is implemented
3. Verify extension ID is unique
4. Check component rendering properly
5. Check React DevTools for prop values

### Type Errors in TypeScript

**Problem:** Plugin types not resolving

**Solutions:**

1. Ensure imports are correct

   ```typescript
   import { WebUIPlugin } from "@/plugin-system";
   ```

2. Check `tsconfig.json` paths
3. Rebuild project
