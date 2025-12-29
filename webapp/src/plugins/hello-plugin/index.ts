/**
 * Example Hello Plugin
 * Demonstrates the basic plugin structure and functionality
 */

import { WebUIPlugin, PluginContext, SidebarMenuExtension } from "@/plugins";
import { lazy } from "react";

// Lazy load the plugin component
const HelloComponent = lazy(() => import("./HelloComponent"));

const helloPlugin: WebUIPlugin = {
  init: async (context: PluginContext) => {
    context.logger.info("Hello Plugin initialized");
    context.storage.set("hello-count", 0);
  },

  destroy: async () => {
    console.log("Hello Plugin destroyed");
  },

  getRouteExtensions: () => [
    {
      path: "/plugins/hello",
      name: "Hello Plugin",
      component: HelloComponent,
    },
  ],

  getSidebarMenuExtensions: (): SidebarMenuExtension[] => [
    {
      id: "hello-menu",
      label: "Hello Plugin",
      path: "/plugins/hello",
      order: 100,
    },
  ],
};

export default helloPlugin;
