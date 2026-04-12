/// <reference types="vite/client" />

declare module "virtual:dicoogle-plugins" {
  export function registerAllPlugins(): void;

  export const discoveredPlugins: Array<{
    id: string;
    name: string;
    directory: string;
    entry: string;
    defaultEnabled: boolean;
  }>;

  const _default: {
    registerAllPlugins: typeof registerAllPlugins;
    discoveredPlugins: typeof discoveredPlugins;
  };

  export default _default;
}
