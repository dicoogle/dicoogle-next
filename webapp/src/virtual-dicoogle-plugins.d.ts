declare module "virtual:dicoogle-plugins" {
  // You can refine these types later; start loose to silence the error
  export function registerAllPlugins(): void;

  export const discoveredPlugins: Array<{
    id: string;
    name: string;
  }>;

  const _default: {
    registerAllPlugins: typeof registerAllPlugins;
    discoveredPlugins: typeof discoveredPlugins;
  };

  export default _default;
}
