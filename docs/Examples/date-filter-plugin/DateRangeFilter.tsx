/**
 * Date Range Filter Component
 */

import { useState } from "react";
import { QueryFilterProps } from "@/plugin-system";
import { Calendar } from "lucide-react";

export default function DateRangeFilter({
  value,
  onChange,
  context,
}: QueryFilterProps) {
  const [enabled, setEnabled] = useState(value?.enabled || false);
  const [from, setFrom] = useState(value?.from || "");
  const [to, setTo] = useState(value?.to || "");

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    onChange({
      ...value,
      enabled: checked,
      from: checked ? from : null,
      to: checked ? to : null,
    });
  };

  const handleFromChange = (newFrom: string) => {
    setFrom(newFrom);
    if (enabled) {
      onChange({ ...value, from: newFrom, to, enabled: true });
    }
  };

  const handleToChange = (newTo: string) => {
    setTo(newTo);
    if (enabled) {
      onChange({ ...value, from, to: newTo, enabled: true });
    }
  };

  const setQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const fromDate = start.toISOString().split("T")[0];
    const toDate = end.toISOString().split("T")[0];

    setFrom(fromDate);
    setTo(toDate);
    setEnabled(true);

    onChange({
      from: fromDate,
      to: toDate,
      enabled: true,
    });

    context.logger.info("Quick range selected", {
      days,
      from: fromDate,
      to: toDate,
    });
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-white">
      {/* Enable Toggle */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 font-medium text-gray-700">
          <Calendar className="w-4 h-4" />
          Filter by Date Range
        </label>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {/* Date Inputs */}
      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                From Date
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => handleFromChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                To Date
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => handleToChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Quick Range Buttons */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Quick Select:
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setQuickRange(7)}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Last 7 days
              </button>
              <button
                onClick={() => setQuickRange(30)}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Last 30 days
              </button>
              <button
                onClick={() => setQuickRange(90)}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Last 90 days
              </button>
              <button
                onClick={() => setQuickRange(365)}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Last year
              </button>
            </div>
          </div>

          {/* Active Range Display */}
          {from && to && (
            <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="font-medium text-blue-900">Active Date Range:</p>
              <p className="mt-1">
                {new Date(from).toLocaleDateString()} →{" "}
                {new Date(to).toLocaleDateString()}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
