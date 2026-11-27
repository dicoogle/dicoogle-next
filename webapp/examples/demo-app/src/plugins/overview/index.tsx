/**
 * Overview: a page of its own, reachable from the top menu.
 * Extension points: getSidebarMenuExtensions, getRouteExtensions; init() subscribes to
 * another plugin's events through the shared event bus.
 */
import { LayoutDashboard } from "lucide-react";
import { defineDicooglePlugin } from "@dicoogle/dicoogle-next-webapp";
import { CSV_EXPORTED_EVENT } from "@demo/dicoogle-csv-export";
import { OverviewPage } from "./OverviewPage";
import { recordExport } from "./exportsLog";

export default defineDicooglePlugin({
  init: (context) => {
    context.eventBus.on(CSV_EXPORTED_EVENT, recordExport);
    context.logger.info("Overview page available at /overview");
  },

  getSidebarMenuExtensions: () => [
    {
      id: "overview",
      label: "Overview",
      icon: <LayoutDashboard className="w-5 h-5 pr-1" />,
      path: "/overview",
      order: 1,
    },
  ],

  getRouteExtensions: () => [{ path: "/overview", name: "Overview", component: OverviewPage }],
});
