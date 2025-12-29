/**
 * Date Filter Plugin - Query Filter Type
 * Adds date range filter to search
 */

import { WebUIPlugin, QueryFilterExtension, PluginContext } from "@/plugins";
import { lazy } from "react";

const DateRangeFilter = lazy(() => import("./DateRangeFilter"));

const dateFilterPlugin: WebUIPlugin = {
  init: async (context: PluginContext) => {
    context.logger.info("Date Filter Plugin initialized");

    // Set default date range (last 30 days)
    const defaultRange = {
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      to: new Date().toISOString().split("T")[0],
    };

    context.storage.set("default-date-range", defaultRange);
  },

  getQueryFilterExtensions: (): QueryFilterExtension[] => [
    {
      id: "study-date-range",
      label: "Study Date",
      description: "Filter studies by date range",
      component: DateRangeFilter,
      defaultValue: {
        from: null,
        to: null,
        enabled: false,
      },
      order: 10,
      applyFilter: (value: {
        from: string | null;
        to: string | null;
        enabled: boolean;
      }) => {
        // Only apply filter if enabled and dates are set
        if (!value.enabled || (!value.from && !value.to)) {
          return "";
        }

        // Convert dates to DICOM format (YYYYMMDD)
        const formatDate = (dateStr: string) => {
          return dateStr.replace(/-/g, "");
        };

        // Build query based on available dates
        if (value.from && value.to) {
          // Date range
          return `StudyDate:[${formatDate(value.from)} TO ${formatDate(value.to)}]`;
        } else if (value.from) {
          // From date onwards
          return `StudyDate:[${formatDate(value.from)} TO 99991231]`;
        } else if (value.to) {
          // Up to date
          return `StudyDate:[00000101 TO ${formatDate(value.to)}]`;
        }

        return "";
      },
    },
  ],
};

export default dateFilterPlugin;
