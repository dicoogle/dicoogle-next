/**
 * Study tools: actions on each search result, configured from a Management tab.
 * Extension points: getResultOptionsExtensions, getSettingsExtensions; per-plugin storage.
 */
import { Copy, ExternalLink, Wrench } from "lucide-react";
import {
  defineDicooglePlugin,
  type PluginContext,
  type ResultOptionActionArgs,
} from "@dicoogle/dicoogle-next-webapp";
import { StudyToolsSettings } from "./StudyToolsSettings";
import { getViewerUrlTemplate, setPluginContext, viewerUrlFor } from "./settings";

export default defineDicooglePlugin({
  // Actions receive the search page's context; keep this plugin's own for its storage.
  init: (context: PluginContext) => setPluginContext(context),

  getResultOptionsExtensions: () => [
    {
      id: "copy-study-uid",
      label: "Copy Study UID",
      icon: <Copy className="w-4 h-4" />,
      order: 1,
      action: async ({ result, context }: ResultOptionActionArgs) => {
        await navigator.clipboard.writeText(result.studyInstanceUID);
        context.ui?.showToast("Study Instance UID copied", "success");
      },
    },
    {
      id: "open-external-viewer",
      label: "Open in external viewer",
      icon: <ExternalLink className="w-4 h-4" />,
      order: 2,
      // Only offered once a viewer URL is set in Management > Study tools.
      condition: () => getViewerUrlTemplate() !== "",
      action: ({ result }: ResultOptionActionArgs) => {
        const url = viewerUrlFor(result.studyInstanceUID);
        if (url) window.open(url, "_blank", "noopener");
      },
    },
  ],

  getSettingsExtensions: () => [
    {
      id: "study-tools",
      label: "Study tools",
      icon: <Wrench className="w-4 h-4" />,
      component: StudyToolsSettings,
      order: 50,
    },
  ],
});

