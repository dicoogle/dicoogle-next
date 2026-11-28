/**
 * Public API of @dicoogle/dicoogle-next-webapp.
 *
 * Host apps render the full Dicoogle Next web app with createDicoogleApp() and extend it with
 * plugins. Everything exported here is part of the package's public contract; anything else
 * under src/ is internal and may change without notice.
 */

// App bootstrap and configuration
export { createDicoogleApp } from "@/bootstrap";
export type {
  DicoogleAppHandle,
  DicoogleAppOptions,
  DicooglePluginRegistration,
} from "@/bootstrap";
export { getAppConfig, publicAssetUrl, resolveApiBaseUrl } from "@/config/appConfig";
export type {
  DicoogleAppConfig,
  DicoogleAppConfigInput,
  DicoogleBranding,
} from "@/config/appConfig";

// Plugin system: types, registry, lifecycle and extension hooks
export * from "@/plugin-system";

import type { WebUIPlugin } from "@/plugin-system";
/** Identity helper that types a plugin object. */
export function defineDicooglePlugin<T extends WebUIPlugin>(plugin: T): T {
  return plugin;
}

// Services and state plugins can use to talk to Dicoogle Next
export { dicoogleService } from "@/services/dicoogleService";
export { useAuthStore } from "@/stores/AuthStore";
export { useSearchStore } from "@/stores/SearchStore";
export * from "@/types";

// UI building blocks, so plugin pages look like the rest of the app
export { Button } from "@/components/ui/Button";
export type { ButtonProps } from "@/components/ui/Button";
export { Input } from "@/components/ui/Input";
export type { InputProps } from "@/components/ui/Input";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
export { Dialog } from "@/components/ui/Dialog";
export { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
export { cn } from "@/utils/cn";
export { toast } from "@/utils/toast";
