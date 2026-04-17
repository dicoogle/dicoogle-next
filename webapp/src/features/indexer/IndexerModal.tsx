import { useState, useEffect, useRef } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { dicoogleService } from "@/services/dicoogleService";
import { useTaskStore } from "@/stores/TaskStore";
import { toast } from "@/utils/toast";
import {
  AlertCircle,
  CheckCircle,
  Play,
  List,
  FolderOpen,
  Eye,
  X,
  Folder,
} from "lucide-react";
import type { TaskInfo } from "@/types";
import { FileBrowserModal } from "./FileBrowserModal";

const INDEXING_TOAST_ID = "indexing-progress";

type TabType = "manual" | "auto";

interface IndexerModalProps {
  open: boolean;
  onClose: () => void;
}

const PATH_SUGGESTIONS = ["file:"];

export function IndexerModal({ open, onClose }: IndexerModalProps) {
  const { tasks, listTasks } = useTaskStore();

  const [activeTab, setActiveTab] = useState<TabType>("manual");

  // Manual indexing state
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // File browser modal state
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);

  // Auto-indexing state
  const [watcherPath, setWatcherPath] = useState("");
  const [watcherEnabled, setWatcherEnabled] = useState(false);
  const [watcherLoading, setWatcherLoading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Tasks modal
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorTask, setErrorTask] = useState<TaskInfo | null>(null);
  const [cancellingTasks, setCancellingTasks] = useState<Set<string>>(
    new Set(),
  );

  // Pagination for tasks modal
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Task polling
  const lastNotifiedTaskRef = useRef<string | null>(null);
  const currentTaskRef = useRef<string | null>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      toast.dismiss(INDEXING_TOAST_ID);
      return;
    }

    loadSettings();
    listTasks();

    const interval = setInterval(() => {
      listTasks();
    }, 2000);

    return () => {
      clearInterval(interval);
      toast.dismiss(INDEXING_TOAST_ID);
    };
  }, [open, listTasks]);

  useEffect(() => {
    if (!open) return;

    if (tasks.length === 0) {
      if (currentTaskRef.current) {
        toast.dismiss(INDEXING_TOAST_ID);
        currentTaskRef.current = null;
      }
      return;
    }

    const runningTask = tasks.find((task) => !task.complete && !task.canceled);

    if (runningTask) {
      if (currentTaskRef.current !== runningTask.taskUid) {
        currentTaskRef.current = runningTask.taskUid;
      }

      if (runningTask.taskProgress >= 0) {
        const progress = Math.round(runningTask.taskProgress * 100);
        toast.loading(`Indexing... ${progress}%`, INDEXING_TOAST_ID);
      } else {
        toast.loading("Indexing...", INDEXING_TOAST_ID);
      }
    } else {
      const latestTask = tasks[0];

      if (latestTask && (latestTask.complete || latestTask.canceled)) {
        if (latestTask.taskUid !== lastNotifiedTaskRef.current) {
          toast.dismiss(INDEXING_TOAST_ID);
          currentTaskRef.current = null;
          lastNotifiedTaskRef.current = latestTask.taskUid;

          if (!latestTask.canceled) {
            if (latestTask.nErrors && latestTask.nErrors > 0) {
              const WarningContent = () => (
                <div>
                  <div>
                    Indexing completed with {latestTask.nErrors} error(s)
                  </div>
                  <button
                    onClick={() => {
                      setErrorTask(latestTask);
                      setErrorModalOpen(true);
                    }}
                    className="text-xs underline mt-1 text-blue-600 hover:text-blue-700"
                  >
                    View details →
                  </button>
                </div>
              );
              toast.warning(<WarningContent />, { duration: 10000 });
            } else {
              toast.success(
                `Indexing completed! ${latestTask.nIndexed || "N/A"} files indexed in ${Math.round((latestTask.elapsedTime || 0) / 1000)}s`,
              );
            }
          }
        } else {
          toast.dismiss(INDEXING_TOAST_ID);
        }
      }
    }
  }, [tasks, open]);

  const sortedTasks = [...tasks].sort((a, b) => {
    const aRunning = !a.complete && !a.canceled;
    const bRunning = !b.complete && !b.canceled;

    if (aRunning && !bRunning) return -1;
    if (!aRunning && bRunning) return 1;

    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const pagedTasks = sortedTasks.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [tasks.length, totalPages, currentPage]);

  const loadSettings = async () => {
    try {
      setLoadingSettings(true);
      const settings = await dicoogleService.getIndexerSettings();
      if (settings.path) setWatcherPath(settings.path);
      if (typeof settings.watcher === "boolean")
        setWatcherEnabled(settings.watcher);
    } catch (err) {
      console.error("Failed to load indexer settings", err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const normalizeFilePath = (inputPath: string): string => {
    const trimmed = inputPath.trim();

    if (trimmed.startsWith("file:") && !trimmed.startsWith("file:///")) {
      let pathPart = trimmed.substring(5);

      pathPart = pathPart.replace(/^\/+/, "");

      return `file:///${pathPart}`;
    }

    return trimmed;
  };

  const handleStartIndex = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedPath = path.trim();
    if (!trimmedPath) {
      toast.error("Please enter a path");
      return;
    }

    const normalizedPath = normalizeFilePath(trimmedPath);

    setLoading(true);
    try {
      console.log("started");
      dicoogleService.index(normalizedPath);
      setPath("");
      toast.info("Indexing task started");

      setTimeout(() => {
        listTasks();
      }, 500);
    } catch (err) {
      console.error("Indexing error:", err);
      toast.error("Failed to start indexing");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTask = async (taskUid: string) => {
    setCancellingTasks((prev) => new Set(prev).add(taskUid));
    try {
      await dicoogleService.stopTask(taskUid);
      listTasks();
      toast.warning("Task Canceled");
    } catch (err) {
      toast.error("Failed to cancel task");
    } finally {
      setCancellingTasks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(taskUid);
        return newSet;
      });
    }
  };

  const handleApplySettings = async () => {
    setWatcherLoading(true);
    try {
      const currentSettings = await dicoogleService.getIndexerSettings();

      await dicoogleService.setIndexerSettings({
        ...currentSettings,
        path: watcherPath,
        watcher: watcherEnabled,
      });

      toast.success("Settings applied successfully");
      await loadSettings();
    } catch (err) {
      toast.error("Failed to apply settings");
      console.error("Settings Update Error:", err);
    } finally {
      setWatcherLoading(false);
    }
  };
  const handlePathSuggestion = (suggestion: string) => {
    setPath(suggestion);
    setShowSuggestions(false);
    pathInputRef.current?.focus();
  };

  const handlePathSelect = (selectedPath: string) => {
    // Convert absolute path to file:/// URI format that Dicoogle expects
    const fileUri = `file://${selectedPath}`;

    if (activeTab === "manual") {
      setPath(fileUri);
    } else {
      setWatcherPath(fileUri);
    }
  };

  const handleClose = () => {
    toast.dismiss(INDEXING_TOAST_ID);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={handleClose} title="Import Data" size="lg">
        <div className="border-b border-border">
          <div className="flex gap-1 px-6">
            <button
              onClick={() => setActiveTab("manual")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "manual"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
            >
              <FolderOpen className="h-4 w-4 inline mr-2" />
              Manual Scan
            </button>
            <button
              onClick={() => setActiveTab("auto")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "auto"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
            >
              <Eye className="h-4 w-4 inline mr-2" />
              Auto-Index
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {activeTab === "manual" ? (
            <form onSubmit={handleStartIndex} className="space-y-4">
              <div>
                <label
                  htmlFor="index-path"
                  className="block text-sm font-medium mb-2"
                >
                  Directory Path
                </label>
                <div className="relative">
                  <Input
                    ref={pathInputRef}
                    id="index-path"
                    value={path}
                    onChange={(e) => {
                      setPath(e.target.value);
                      setShowSuggestions(e.target.value.length > 0);
                    }}
                    onFocus={() => setShowSuggestions(path.length > 0)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="e.g., file:///path/to/dicom or /path/to/dicom"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setFileBrowserOpen(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title="Browse directories"
                  >
                    <Folder className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
                {showSuggestions && (
                  <div className="mt-1 bg-white border rounded-md shadow-xs">
                    {PATH_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handlePathSuggestion(suggestion)}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  Enter a file:// URI or an absolute path to start indexing
                </p>
              </div>

              <div className="flex gap-2 justify-between">
                <Button
                  type="button"
                  variant="outline-solid"
                  onClick={() => setTasksModalOpen(true)}
                >
                  <List className="h-4 w-4 mr-2" />
                  View Tasks ({tasks.length})
                </Button>
                <Button type="submit" disabled={loading || !path.trim()}>
                  <Play className="h-4 w-4 mr-2" />
                  Start Indexing
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-sm mb-1">Auto-Indexing</h3>
                <p className="text-sm text-muted-foreground">
                  Automatically monitor and index new files in a directory
                </p>
              </div>

              <div>
                <label
                  htmlFor="watcher-path"
                  className="block text-sm font-medium mb-2"
                >
                  Watch Directory
                </label>
                <div className="relative">
                  <Input
                    id="watcher-path"
                    value={watcherPath}
                    onChange={(e) => setWatcherPath(e.target.value)}
                    placeholder="e.g., file:///path/to/watch or /path/to/watch"
                    disabled={loadingSettings}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setFileBrowserOpen(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title="Browse directories"
                    disabled={loadingSettings}
                  >
                    <Folder className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="watcher-enabled"
                  checked={watcherEnabled}
                  onChange={(e) => setWatcherEnabled(e.target.checked)}
                  disabled={loadingSettings}
                  className="rounded"
                />
                <label htmlFor="watcher-enabled" className="text-sm">
                  Enable Auto-Indexing
                </label>
              </div>

              <Button
                onClick={handleApplySettings}
                disabled={watcherLoading || loadingSettings}
                className="w-full"
              >
                Apply Settings
              </Button>
            </div>
          )}
        </div>
      </Dialog>

      {/* Tasks Modal */}
      <Dialog
        open={tasksModalOpen}
        onClose={() => setTasksModalOpen(false)}
        title="Indexing Tasks"
        size="md"
      >
        <div className="p-6">
          {sortedTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No tasks yet
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {pagedTasks.map((task) => {
                  const isRunning = !task.complete && !task.canceled;
                  const isCancelling = cancellingTasks.has(task.taskUid);

                  return (
                    <div
                      key={task.taskUid}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {isRunning ? (
                              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                            ) : task.canceled ? (
                              <X className="h-4 w-4 text-yellow-600" />
                            ) : task.nErrors && task.nErrors > 0 ? (
                              <AlertCircle className="h-4 w-4 text-orange-600" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            )}
                            <span className="font-medium text-sm">
                              {task.taskName}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {task.taskUid}
                          </div>
                        </div>

                        {isRunning && (
                          <Button
                            size="sm"
                            variant="outline-solid"
                            onClick={() => handleCancelTask(task.taskUid)}
                            disabled={isCancelling}
                          >
                            {isCancelling ? "Canceling..." : "Cancel"}
                          </Button>
                        )}
                      </div>

                      {task.taskProgress !== undefined &&
                        task.taskProgress >= 0 && (
                          <div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-primary h-1.5 rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.round(task.taskProgress * 100)}%`,
                                }}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {Math.round(task.taskProgress * 100)}%
                            </div>
                          </div>
                        )}

                      <div className="flex gap-4 text-xs text-muted-foreground">
                        {task.nIndexed !== undefined && (
                          <span>Indexed: {task.nIndexed}</span>
                        )}
                        {task.nErrors !== undefined && task.nErrors > 0 && (
                          <span className="text-orange-600">
                            Errors: {task.nErrors}
                          </span>
                        )}
                        {task.elapsedTime !== undefined && (
                          <span>
                            Time: {Math.round(task.elapsedTime / 1000)}s
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <Button
                    size="sm"
                    variant="outline-solid"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline-solid"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Dialog>

      {/* Error Details Modal */}
      <Dialog
        open={errorModalOpen}
        onClose={() => {
          setErrorModalOpen(false);
          setErrorTask(null);
        }}
        title="Task Error Details"
        size="md"
      >
        <div className="p-6">
          {errorTask && (
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium">Task: </span>
                <span className="text-sm text-muted-foreground">
                  {errorTask.taskName}
                </span>
              </div>
              <div>
                <span className="text-sm font-medium">Errors: </span>
                <span className="text-sm text-orange-600">
                  {errorTask.nErrors}
                </span>
              </div>
              <div>
                <span className="text-sm font-medium">Indexed: </span>
                <span className="text-sm text-muted-foreground">
                  {errorTask.nIndexed || "N/A"} files
                </span>
              </div>
              <div>
                <span className="text-sm font-medium">Time: </span>
                <span className="text-sm text-muted-foreground">
                  {Math.round((errorTask.elapsedTime || 0) / 1000)}s
                </span>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* File Browser Modal */}
      <FileBrowserModal
        isOpen={fileBrowserOpen}
        onClose={() => setFileBrowserOpen(false)}
        onPathSelect={handlePathSelect}
      />
    </>
  );
}
