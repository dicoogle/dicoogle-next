/**
 * Analytics Dashboard Page Component
 */

import { useState, useEffect, useCallback } from "react";
import { dicoogleService } from "@/services/dicoogleService";
import { BarChart3, TrendingUp, Users, Calendar } from "lucide-react";

interface Stats {
  totalStudies: number;
  modalityCounts: Record<string, number>;
  recentStudies: number;
  uniquePatients: Set<string>;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Search for all studies
      const results = await dicoogleService.search({
        query: "*",
        providers: ["lucene"],
      });

      // Calculate statistics
      const modalityCounts: Record<string, number> = {};
      const uniquePatients = new Set<string>();
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      let recentCount = 0;

      results.results.forEach((result: any) => {
        const modality = result.fields?.Modality || "Unknown";
        modalityCounts[modality] = (modalityCounts[modality] || 0) + 1;

        const patientId = result.fields?.PatientID;
        if (patientId) {
          uniquePatients.add(patientId);
        }

        const studyDate = result.fields?.StudyDate;
        if (studyDate) {
          const date = parseStudyDate(studyDate);
          if (date && date.getTime() > thirtyDaysAgo) {
            recentCount++;
          }
        }
      });

      setStats({
        totalStudies: results.results.length,
        modalityCounts,
        recentStudies: recentCount,
        uniquePatients,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const parseStudyDate = (dateStr: string): Date | null => {
    // DICOM date format: YYYYMMDD
    if (dateStr.length === 8) {
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      return new Date(year, month, day);
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">
            Error Loading Analytics
          </h3>
          <p className="text-red-600 mt-2">{error}</p>
          <button
            onClick={loadAnalytics}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-blue-600" />
          Analytics Dashboard
        </h1>
        <p className="text-gray-600 mt-2">PACS statistics and insights</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Total Studies"
          value={stats?.totalStudies.toLocaleString() || "0"}
          icon={<BarChart3 className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Recent Studies (30d)"
          value={stats?.recentStudies.toLocaleString() || "0"}
          icon={<Calendar className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Unique Patients"
          value={stats?.uniquePatients.size.toLocaleString() || "0"}
          icon={<Users className="w-6 h-6" />}
          color="purple"
        />
      </div>

      {/* Modality Distribution */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Modality Distribution
        </h2>
        <div className="space-y-3">
          {stats &&
            Object.entries(stats.modalityCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([modality, count]) => (
                <div key={modality} className="flex items-center">
                  <div className="w-24 font-medium text-gray-700">
                    {modality}
                  </div>
                  <div className="flex-1">
                    <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(count / (stats?.totalStudies || 1)) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                  <div className="w-20 text-right font-semibold text-gray-900">
                    {count.toLocaleString()}
                  </div>
                  <div className="w-16 text-right text-sm text-gray-500">
                    {((count / (stats?.totalStudies || 1)) * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
        </div>
      </div>

      {/* Refresh Button */}
      <div className="mt-6">
        <button
          onClick={loadAnalytics}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: "blue" | "green" | "purple";
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  );
}
