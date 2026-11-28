/**
 * Patient timeline: another way to show search results, grouped by patient in date order.
 * Extension point: getResultRendererExtensions. Registered disabled in main.tsx: enable it in
 * Management > Plugins, then pick it with the view buttons above the results.
 */
import { GanttChart } from "lucide-react";
import { defineDicooglePlugin } from "@dicoogle/dicoogle-next-webapp";
import { PatientTimeline } from "./PatientTimeline";

export default defineDicooglePlugin({
  getResultRendererExtensions: () => [
    {
      id: "patient-timeline",
      name: "Timeline",
      icon: <GanttChart className="w-4 h-4" />,
      order: 10,
      component: PatientTimeline,
    },
  ],
});
