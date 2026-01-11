/**
 * Gallery View Plugin - Result Renderer Type
 * Alternative gallery view for search results
 */

import {
  WebUIPlugin,
  ResultRendererExtension,
  PluginContext,
} from "@/plugin-system";
import { lazy } from "react";

const GalleryView = lazy(() => import("./GalleryView"));

const galleryViewPlugin: WebUIPlugin = {
  init: async (context: PluginContext) => {
    context.logger.info("Gallery View Plugin initialized");

    // Load user preferences
    const prefs = context.storage.get("gallery-preferences") || {
      gridColumns: 4,
      showLabels: true,
      imageSize: "medium",
    };

    context.storage.set("gallery-preferences", prefs);
  },

  getResultRendererExtensions: (): ResultRendererExtension[] => [
    {
      id: "gallery-renderer",
      name: "Gallery",
      icon: "na",
      component: GalleryView,
    },
  ],
};

export default galleryViewPlugin;
