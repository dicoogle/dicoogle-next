import { useEffect, useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { dicoogleService } from "@/services/dicoogleService";
import { type Version } from "@/types/index";
import { FileText, Pause, Play } from "lucide-react";

export function SystemInfo() {
  const [version, setVersion] = useState<Version | null>(null);
  const [aeTitle, setAETitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logContent, setLogContent] = useState<string>("");
  const [logLoading, setLogLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const logContainerRef = useRef<HTMLPreElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    loadSystemInfo();
  }, []);

  const fetchLog = useCallback(async () => {
    try {
      const log = await dicoogleService.getServerLog();
      setLogContent(log);

      setLogLoading(false);
    } catch (err) {
      setLogContent((prevContent) => {
        if (!prevContent) {
          return "Error loading log file.";
        }
        return prevContent;
      });
      console.error("Failed to fetch log:", err);
    }
  }, []);

  useEffect(() => {
    if (logOpen && isPolling) {
      fetchLog();

      pollIntervalRef.current = setInterval(() => {
        fetchLog();
      }, 2000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [logOpen, isPolling, fetchLog]); // fetchLog is now stable!

  // Auto-scroll to bottom when log content changes
  useEffect(() => {
    if (logContainerRef.current && shouldAutoScrollRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logContent]);

  const loadSystemInfo = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load version
      const versionData = await dicoogleService.getVersion();
      setVersion(versionData);

      // Load AE Title
      const aeTitleData = await dicoogleService.getAETitle();
      setAETitle(aeTitleData.aetitle || "N/A");
    } catch (err) {
      setError("Failed to load system information");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewLog = async () => {
    setLogOpen(true);
    setIsPolling(true);
    setLogLoading(true);
    shouldAutoScrollRef.current = true;
  };

  const handleCloseLog = () => {
    setLogOpen(false);
    setIsPolling(false);
    setLogContent("");
  };

  const togglePolling = () => {
    setIsPolling(!isPolling);
  };

  const handleScroll = () => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
      // If user scrolls up, disable auto-scroll
      // If scrolled to bottom (within 10px), enable auto-scroll
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
      shouldAutoScrollRef.current = isAtBottom;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">
          Loading system information...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            System Information
          </h2>
          <p className="text-sm text-muted-foreground">
            View Dicoogle instance details and settings
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 text-sm border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        {/* Application Info */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Dicoogle Application
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow label="Version" value={version?.version || "Unknown"} />
            <InfoRow label="AE Title" value={aeTitle} />
          </div>
        </Card>

        {/* Server Log Button */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Server Logs
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            View the Dicoogle server log for troubleshooting and monitoring.
          </p>
          <Button
            onClick={handleViewLog}
            variant="outline-solid"
            className="w-full sm:w-auto"
          >
            <FileText className="h-4 w-4 mr-2" />
            View Server Log
          </Button>
        </Card>

        {/* Information Section */}
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
            ℹ About Dicoogle
          </h4>
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed mb-2">
            Dicoogle is an open-source PACS (Picture Archiving and
            Communications System) that provides a modern alternative to
            traditional medical image archiving solutions.
          </p>
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            For more information, visit{" "}
            <a
              href="https://www.dicoogle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
            >
              dicoogle.com
            </a>
          </p>
        </Card>
      </div>

      {/* Log Modal */}
      <Dialog
        open={logOpen}
        onClose={handleCloseLog}
        title="Server Log"
        size="xl"
      >
        <div className="p-6">
          {/* Controls */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button
                onClick={togglePolling}
                variant="outline-solid"
                size="sm"
                className="gap-2"
              >
                {isPolling ? (
                  <>
                    <Pause className="h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Resume
                  </>
                )}
              </Button>
              {isPolling && (
                <span className="text-xs text-muted-foreground animate-pulse">
                  ● Updating every 2s
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {logContent.split("\n").length} lines
            </div>
          </div>

          {/* Log Content */}
          {logLoading && !logContent ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading log...
            </div>
          ) : (
            <pre
              ref={logContainerRef}
              onScroll={handleScroll}
              className="bg-muted/50 p-4 rounded-lg text-xs font-mono overflow-auto max-h-[60vh] whitespace-pre-wrap wrap-break-word"
            >
              {logContent || "No log content available."}
            </pre>
          )}

          {/* Auto-scroll indicator */}
          {!shouldAutoScrollRef.current && isPolling && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              ⚠ Auto-scroll disabled (scroll to bottom to re-enable)
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-medium text-foreground font-mono break-all">
        {value}
      </p>
    </div>
  );
}
