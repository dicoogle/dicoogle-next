/**
 * Analytics Plugin - Page Type
 * Full analytics dashboard page
 */

import {
  WebUIPlugin,
  PluginContext,
  RouteExtension,
  SidebarMenuExtension,
} from "@/plugins";
import { lazy } from "react";
import { BarChart3 } from "lucide-react";

const AnalyticsPage = lazy(() => import("./AnalyticsPage"));

const analyticsPlugin: WebUIPlugin = {
  metadata: {
    id: "analytics-dashboard",
    name: "Analytics Dashboard",
    version: "1.0.0",
    description: "View PACS statistics and analytics",
    author: "Dicoogle Team",
    type: "page",
    icon: "na",
  },

  init: async (context: PluginContext) => {
    context.logger.info("Analytics Plugin initialized");

    // Fetch initial statistics
    try {
      const results = await context.dicoogle.search("*", {
        provider: "lucene",
      });

      context.storage.set("lastStats", {
        totalStudies: results.results?.length || 0,
        lastUpdate: Date.now(),
      });

      context.logger.info("Initial stats loaded", {
        totalStudies: results.results?.length,
      });
    } catch (error) {
      context.logger.error("Failed to load initial stats", error);
    }
  },

  getRouteExtensions: (): RouteExtension[] => [
    {
      path: "/analytics",
      name: "Analytics",
      component: AnalyticsPage,
    },
  ],

  getSidebarMenuExtensions: (): SidebarMenuExtension[] => [
    {
      id: "analytics-menu",
      label: "Analytics",
      icon: "na",
      path: "/analytics",
      order: 40,
    },
  ],
};

export default analyticsPlugin;
