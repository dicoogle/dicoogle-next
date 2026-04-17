// webapp/src/features/management/components/LoggerView.tsx
import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { dicoogleService } from "@/services/dicoogleService";

export function LoggerView() {
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const logText = await dicoogleService.getServerLog();
      setLogs(logText);
    } catch (err) {
      console.error(err);
      setLogs("Error loading logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Card className="p-0 overflow-hidden flex flex-col h-[600px] bg-[#1e1e1e] border-gray-800">
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-[#252526]">
        <h3 className="text-sm font-semibold text-gray-200">Server Logs</h3>
        <Button
          size="sm"
          variant="outline-solid"
          onClick={fetchLogs}
          disabled={loading}
          className="text-xs h-8"
        >
          {loading ? "Refreshing..." : "Refresh Now"}
        </Button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-gray-300 whitespace-pre-wrap"
      >
        {logs || "No logs available."}
      </div>
    </Card>
  );
}
