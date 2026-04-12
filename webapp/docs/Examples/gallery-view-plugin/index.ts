/**
 * Study Workbench Plugin - Result Renderer Type
 * Hybrid list + preview workflow for search results
 */

import {
  WebUIPlugin,
  ResultRendererExtension,
  PluginContext,
} from "@/plugin-system";
import { createElement, lazy } from "react";
import { LayoutPanelTop } from "lucide-react";

const StudyWorkbenchView = lazy(() => import("./GalleryView"));

const studyWorkbenchPlugin: WebUIPlugin = {
  init: async (context: PluginContext) => {
    context.logger.info("Study Workbench initialized");

    const prefs = context.storage.get("workbench-preferences") || {
      pinnedModality: "ALL",
      hideUnknownPatient: false,
      orderBy: "studyDate-desc",
    };

    context.storage.set("workbench-preferences", prefs);
  },

  getResultRendererExtensions: (): ResultRendererExtension[] => [
    {
      id: "study-workbench-renderer",
      name: "Workbench",
      icon: createElement(LayoutPanelTop, { className: "w-4 h-4" }),
      component: StudyWorkbenchView,
    },
  ],
};

export default studyWorkbenchPlugin;
