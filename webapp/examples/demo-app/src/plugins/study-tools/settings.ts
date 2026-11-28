import type { PluginContext } from "@dicoogle/dicoogle-next-webapp";

export const VIEWER_URL_KEY = "viewer-url";

let pluginContext: PluginContext | null = null;

export function setPluginContext(context: PluginContext): void {
  pluginContext = context;
}

export function getViewerUrlTemplate(): string {
  return (pluginContext?.storage.get(VIEWER_URL_KEY) as string | null) ?? "";
}

export function setViewerUrlTemplate(template: string): void {
  if (template.trim()) {
    pluginContext?.storage.set(VIEWER_URL_KEY, template.trim());
  } else {
    pluginContext?.storage.remove(VIEWER_URL_KEY);
  }
}

/** The configured viewer URL for a study, or null when none is configured. */
export function viewerUrlFor(studyInstanceUID: string): string | null {
  const template = getViewerUrlTemplate();
  return template ? template.replace("{StudyInstanceUID}", encodeURIComponent(studyInstanceUID)) : null;
}
