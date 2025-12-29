/**
 * Gallery View Plugin - Result Renderer Type
 * Alternative gallery view for search results
 */

import { WebUIPlugin, ResultRendererExtension, PluginContext } from "@/plugins";
import { lazy } from "react";
import { Grid3x3 } from "lucide-react";

const GalleryView = lazy(() => import("./GalleryView"));

const galleryViewPlugin: WebUIPlugin = {
  metadata: {
    id: "gallery-view",
    name: "Gallery View",
    version: "1.0.0",
    description: "Display search results as an image gallery",
    author: "Dicoogle Team",
    type: "result-renderer",
  },

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
