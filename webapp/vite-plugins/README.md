# Vite Plugins

Custom Vite plugins for dicoogle-next build process.

## Plugin Loader (`plugin-loader.ts`)

Automatically discovers and loads WebUI plugins at buildtime.

### How It Works

1. **Discovery Phase**: Scans `src/plugins` directory for subdirectories containing `plugin.config.json`
2. **Configuration Reading**: Reads plugin configuration and entry points
3. **Code Generation**: Generates a virtual module that imports all discovered plugins
4. **Registration**: Provides `registerAllPlugins()` function to register plugins at runtime

### Configuration

Add to `vite.config.ts`:

```typescript
import { createPluginLoader } from './vite-plugins/plugin-loader';

export default defineConfig({
  plugins: [
    // ... other plugins
    createPluginLoader(),
  ],
});
```

### Virtual Module

The plugin creates a virtual module `virtual:dicoogle-plugins` that can be imported:

```typescript
import { registerAllPlugins, discoveredPlugins } from 'virtual:dicoogle-plugins';

// Register all discovered plugins
registerAllPlugins();

// Get list of discovered plugins for debugging
console.log('Plugins:', discoveredPlugins);
```

### Plugin Discovery

A plugin is discovered if:

1. It exists in a subdirectory of `src/plugins`
2. It contains a `plugin.config.json` file with valid JSON
3. The `plugin.config.json` has an `id` property
4. The entry file (default: `index.ts`) exists and is readable

### plugin.config.json Format

```json
{
  "id": "unique-plugin-id",
  "entry": "index.ts"
}
```

**Properties:**
- `id` (required): Unique plugin identifier used for registration
- `entry` (optional): Entry file path relative to plugin directory (defaults to `index.ts`)

### Output

During build, the plugin loader will output:

```
√ Plugin Loader: Discovered 2 plugin(s)
  - plugin-id-1 (plugin-name-1)
  - plugin-id-2 (plugin-name-2)
```

If no plugins are discovered, no output is shown.

### Error Handling

The plugin loader handles errors gracefully:

- Invalid JSON in `plugin.config.json`: Logged to console, plugin skipped
- Missing entry file: Logged to warning, plugin skipped
- Missing plugins directory: Logged as warning, continues
- Duplicate plugin IDs: Logged as warning during registration, second plugin skipped

### Adding New Plugins

To add a new plugin:

1. Create directory: `src/plugins/my-plugin/`
2. Create `plugin.config.json`:
   ```json
   {
     "id": "my-plugin",
     "entry": "index.ts"
   }
   ```
3. Create `index.ts` exporting `WebUIPlugin` default
4. Run build - plugin will be automatically discovered

### Removing Plugins

To disable a plugin temporarily:
- Rename the `plugin.config.json` file, or
- Delete the plugin directory, or
- Comment out the plugin import in generated code (not recommended)

### Future Enhancements

Potential improvements:

- Hot reload support for development
- Plugin dependency resolution
- Plugin version constraints
- Environment-specific plugin loading
- Plugin aliases configuration
- Plugin load order specification
