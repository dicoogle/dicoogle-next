/**
 * Ambient types for host apps. Reference them from the host's tsconfig:
 *
 *   "compilerOptions": { "types": ["vite/client", "@dicoogle/dicoogle-next-webapp/client"] }
 */
declare module "*.wasm" {
  const url: string;
  export default url;
}
