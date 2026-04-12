import DicoogleClient from "dicoogle-client";
import { toast } from "sonner";
import { dicoogleService } from "@/services/dicoogleService";
import { PluginContext } from "./types";

export const PLUGIN_STATE_CHANGED_EVENT = "plugin-state-changed";

type EventCallback = (data: any) => void;

const listeners: Map<string, Set<EventCallback>> = new Map();

function getBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  if (envUrl && envUrl.startsWith("/")) {
    const { protocol, hostname, port } = window.location;
    return `${protocol}//${hostname}${port ? `:${port}` : ""}${envUrl}`;
  }

  if (envUrl && (envUrl.startsWith("http://") || envUrl.startsWith("https://"))) {
    return envUrl;
  }

  return window.location.origin;
}

function getSharedDicoogleClient() {
  const existing = dicoogleService.getClient();
  if (existing) {
    return existing;
  }

  const fallback = DicoogleClient(getBaseUrl());
  const token = localStorage.getItem("dicoogle_token");
  if (token) {
    fallback.setToken(token);
  }
  return fallback;
}

export function createPluginContext(pluginId = "unknown"): PluginContext {
  return {
    appVersion: import.meta.env.VITE_APP_VERSION || "1.0.0",
    logger: {
      log: (message: string, data?: any) =>
        console.log(`[Plugin:${pluginId}] ${message}`, data),
      warn: (message: string, data?: any) =>
        console.warn(`[Plugin:${pluginId}] ${message}`, data),
      error: (message: string, error?: any) =>
        console.error(`[Plugin:${pluginId}] ${message}`, error),
      info: (message: string, data?: any) =>
        console.info(`[Plugin:${pluginId}] ${message}`, data),
    },
    storage: {
      get: (key: string) => {
        try {
          const item = localStorage.getItem(`plugin_${pluginId}_${key}`);
          return item ? JSON.parse(item) : null;
        } catch {
          return null;
        }
      },
      set: (key: string, value: any) => {
        try {
          localStorage.setItem(`plugin_${pluginId}_${key}`, JSON.stringify(value));
        } catch (error) {
          console.warn(`Failed to set plugin storage: ${key}`, error);
        }
      },
      remove: (key: string) => {
        try {
          localStorage.removeItem(`plugin_${pluginId}_${key}`);
        } catch (error) {
          console.warn(`Failed to remove plugin storage: ${key}`, error);
        }
      },
    },
    eventBus: {
      on: (event: string, callback: EventCallback) => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event)!.add(callback);
      },
      off: (event: string, callback: EventCallback) => {
        listeners.get(event)?.delete(callback);
      },
      emit: (event: string, data: any) => {
        listeners.get(event)?.forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
            console.error(`Error in event listener for "${event}":`, error);
          }
        });
      },
    },
    dicoogle: getSharedDicoogleClient(),
    ui: {
      showToast: (message, type = "info") => {
        if (type === "success") {
          toast.success(message);
          return;
        }
        if (type === "error") {
          toast.error(message);
          return;
        }
        if (type === "warning") {
          toast.warning(message);
          return;
        }
        toast.info(message);
      },
    },
  };
}

export function emitPluginStateChanged(pluginId: string, enabled: boolean): void {
  window.dispatchEvent(
    new CustomEvent(PLUGIN_STATE_CHANGED_EVENT, {
      detail: { pluginId, enabled },
    }),
  );
}
