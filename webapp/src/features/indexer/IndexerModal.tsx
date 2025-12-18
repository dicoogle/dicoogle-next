import { useState, useEffect, useRef } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { dicoogleService } from "@/services/dicoogleService";
import { useTaskStore } from "@/stores/TaskStore";
import { useAuthStore } from "@/stores/AuthStore";
import { toast } from "@/utils/toast";
import {
  AlertCircle,
  CheckCircle,
  Play,
  List,
  FolderOpen,
  Eye,
  X,
} from "lucide-react";
import type { TaskInfo } from "@/types";

const INDEXING_TOAST_ID = "indexing-progress";

type TabType = "manual" | "auto";

interface IndexerModalProps {
  open: boolean;
  onClose: () => void;
}

// Path suggestions
const PATH_SUGGESTIONS = ["file:"];

export function IndexerModal({ open, onClose }: IndexerModalProps) {
  const { user } = useAuthStore();
  const { tasks, listTasks } = useTaskStore();

  const [activeTab, setActiveTab] = useState<TabType>("manual");

  // Manual indexing state
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Auto-indexing state
  const [watcherPath, setWatcherPath] = useState("");
  const [watcherEnabled, setWatcherEnabled] = useState(false);
  const [effort, setEffort] = useState(100);
  const [indexZip, setIndexZip] = useState(false);
  const [saveThumbnail, setSaveThumbnail] = useState(true);
  const [thumbnailSize, setThumbnailSize] = useState(128);
  const [watcherLoading, setWatcherLoading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Tasks modal
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorTask, setErrorTask] = useState<TaskInfo | null>(null);
  const [cancellingTasks, setCancellingTasks] = useState<Set<string>>(
    new Set(),
  );

  // Task polling
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const lastNotifiedTaskRef = useRef<string | null>(null);
  const currentTaskRef = useRef<string | null>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // Reset refs when opening
      lastNotifiedTaskRef.current = null;
      currentTaskRef.current = null;

      loadSettings();
      listTasks();

      // Poll for task updates every 2 seconds
      const interval = setInterval(() => {
        listTasks();
      }, 2000);
      setPollInterval(interval);

      return () => {
        if (interval) clearInterval(interval);
        toast.dismiss(INDEXING_TOAST_ID);
      };
    } else {
      // Clear toast when closing modal
      toast.dismiss(INDEXING_TOAST_ID);
      if (pollInterval) {
        clearInterval(pollInterval);
        setPollInterval(null);
      }
    }
  }, [open]);

  // Monitor task completion and show appropriate toast
  useEffect(() => {
    if (!open) return; // Don't process tasks if modal is closed

    if (tasks.length === 0) {
      if (currentTaskRef.current) {
        toast.dismiss(INDEXING_TOAST_ID);
        currentTaskRef.current = null;
      }
      return;
    }

    const latestTask = tasks[0];

    // Check if task was canceled - dismiss loading toast
    // if (
    //   latestTask.canceled &&
    //   latestTask.taskUid !== lastNotifiedTaskRef.current
    // ) {
    //   toast.dismiss(INDEXING_TOAST_ID);
    //   currentTaskRef.current = null;
    //   lastNotifiedTaskRef.current = latestTask.taskUid;
    //
    //   if (pollInterval) {
    //     clearInterval(pollInterval);
    //     setPollInterval(null);
    //   }
    //   return;
    // }

    if (latestTask.complete || latestTask.canceled) {
      if (latestTask.taskUid !== lastNotifiedTaskRef.current) {
        toast.dismiss(INDEXING_TOAST_ID);
        currentTaskRef.current = null;
        lastNotifiedTaskRef.current = latestTask.taskUid;

        if (pollInterval) {
          clearInterval(pollInterval);
          setPollInterval(null);
        }

        if (latestTask.nErrors && latestTask.nErrors > 0) {
          const WarningContent = () => (
            <div>
              <div>Indexing completed with {latestTask.nErrors} error(s)</div>
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
        } else if (latestTask.canceled) {
          toast.warning("Indexing canceled!");
        } else {
          toast.success(
            `Indexing completed! ${latestTask.nIndexed || "N/A"} files indexed in ${Math.round((latestTask.elapsedTime || 0) / 1000)}s`,
          );
        }
      }
    } else {
      // Task is still running
      if (currentTaskRef.current !== latestTask.taskUid) {
        currentTaskRef.current = latestTask.taskUid;
      }

      if (latestTask.taskProgress >= 0) {
        const progress = Math.round(latestTask.taskProgress * 100);
        toast.loading(`Indexing... ${progress}%`, INDEXING_TOAST_ID);
      } else {
        toast.loading("Indexing...", INDEXING_TOAST_ID);
      }
    }
  }, [tasks, open]);

  const loadSettings = async () => {
    try {
      setLoadingSettings(true);
      const settings = await dicoogleService.getIndexerSettings();
      if (settings.path) setWatcherPath(settings.path);
      if (typeof settings.watcher === "boolean")
        setWatcherEnabled(settings.watcher);
      if (typeof settings.effort === "number") setEffort(settings.effort);
      if (typeof settings.zip === "boolean") setIndexZip(settings.zip);
      if (typeof settings.thumbnail === "boolean")
        setSaveThumbnail(settings.thumbnail);
      if (typeof settings.thumbnailSize === "number")
        setThumbnailSize(settings.thumbnailSize);
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
      dicoogleService.index(normalizedPath);
      setPath("");
      toast.info("Indexing task started");
      listTasks();
    } catch (err) {
      console.error("Indexing error:", err);
      toast.error("Failed to start indexing");
    } finally {
      // Re-enable button immediately
      setLoading(false);
    }
  };

  const handleCancelTask = async (taskUid: string) => {
    setCancellingTasks((prev) => new Set(prev).add(taskUid));
    try {
      await dicoogleService.stopTask(taskUid);
      // Trigger immediate refresh without awaiting
      listTasks();
      toast.info("Task cancellation requested");
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
      await dicoogleService.setIndexerSettings({
        path: watcherPath,
        watcher: watcherEnabled,
        effort: effort,
        zip: indexZip,
        thumbnail: saveThumbnail,
        thumbnailSize: thumbnailSize,
      });
      toast.success("Settings applied successfully");
      await loadSettings();
    } catch (err) {
      toast.error("Failed to apply settings");
    } finally {
      setWatcherLoading(false);
    }
  };

  const handlePathSuggestion = (suggestion: string) => {
    setPath(suggestion);
    setShowSuggestions(false);
    pathInputRef.current?.focus();
  };

  const handleClose = () => {
    // Dismiss toast when closing
    toast.dismiss(INDEXING_TOAST_ID);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={handleClose} title="Indexer" size="lg">
        <div className="border-b border-border">
          <div className="flex gap-1 px-6">
            <button
              onClick={() => setActiveTab("manual")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "manual"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <FolderOpen className="h-4 w-4 inline mr-2" />
              Manual Indexing
            </button>
            <button
              onClick={() => setActiveTab("auto")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "auto"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Eye className="h-4 w-4 inline mr-2" />
              Auto-Indexing
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Manual Indexing Tab */}
          {activeTab === "manual" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Index Directory</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Specify a path to index DICOM files. Dicoogle will recursively
                  scan all files in the directory.
                </p>
              </div>

              <form onSubmit={handleStartIndex} className="space-y-4">
                <div className="relative">
                  <label className="block text-xs font-medium mb-2">
                    Directory Path
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Input
                        ref={pathInputRef}
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() =>
                          setTimeout(() => setShowSuggestions(false), 200)
                        }
                        placeholder="Enter path (e.g., file:/path/to/dicom)"
                        required
                      />
                      {showSuggestions && PATH_SUGGESTIONS.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-md shadow-lg">
                          <div className="py-1">
                            {PATH_SUGGESTIONS.map((suggestion, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handlePathSuggestion(suggestion)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors font-mono"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="shrink-0"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start Indexing
                    </Button>
                  </div>
                </div>
              </form>

              {/* View Tasks Button */}
              {tasks.length > 0 && (
                <div className="pt-4 border-t">
                  <Button
                    onClick={() => setTasksModalOpen(true)}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <List className="h-4 w-4" />
                    View Indexing Tasks ({tasks.length})
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Auto-Indexing Tab */}
          {activeTab === "auto" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Directory Watcher Settings
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Configure automatic indexing of new DICOM files added to a
                  watched directory.
                </p>
              </div>

              {loadingSettings ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Loading settings...
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Watch Directory */}
                  <div>
                    <label className="block text-xs font-medium mb-2">
                      Watch Directory
                    </label>
                    <Input
                      value={watcherPath}
                      onChange={(e) => setWatcherPath(e.target.value)}
                      placeholder="file:///path/to/watch"
                      disabled={loadingSettings}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Files added to this directory will be automatically
                      indexed.
                    </p>
                  </div>

                  {/* Enable Watcher */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div>
                      <div className="text-sm font-medium">Enable Watcher</div>
                      <div className="text-xs text-muted-foreground">
                        Monitor directory for new files
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={watcherEnabled}
                        onChange={(e) => setWatcherEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {/* Indexing Effort */}
                  <div>
                    <label className="block text-xs font-medium mb-2">
                      Indexing Effort: {effort}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="10"
                      value={effort}
                      onChange={(e) => setEffort(parseInt(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Higher effort means more thorough indexing but uses more
                      CPU resources.
                    </p>
                  </div>

                  {/* Index ZIP Files */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div>
                      <div className="text-sm font-medium">Index ZIP Files</div>
                      <div className="text-xs text-muted-foreground">
                        Extract and index DICOM files within ZIP archives
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={indexZip}
                        onChange={(e) => setIndexZip(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {/* Save Thumbnails */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div>
                      <div className="text-sm font-medium">Save Thumbnails</div>
                      <div className="text-xs text-muted-foreground">
                        Generate and store image thumbnails during indexing
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveThumbnail}
                        onChange={(e) => setSaveThumbnail(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {/* Thumbnail Size */}
                  {saveThumbnail && (
                    <div>
                      <label className="block text-xs font-medium mb-2">
                        Thumbnail Size: {thumbnailSize}px
                      </label>
                      <input
                        type="range"
                        min="64"
                        max="512"
                        step="64"
                        value={thumbnailSize}
                        onChange={(e) =>
                          setThumbnailSize(parseInt(e.target.value))
                        }
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>64px</span>
                        <span>512px</span>
                      </div>
                    </div>
                  )}

                  {/* Apply Button */}
                  <div className="pt-4 border-t">
                    <Button
                      onClick={handleApplySettings}
                      disabled={watcherLoading}
                      className="w-full"
                    >
                      {watcherLoading ? "Applying..." : "Apply Settings"}
                    </Button>
                  </div>

                  {/* Status Indicator */}
                  {watcherEnabled && watcherPath && (
                    <div className="flex items-center gap-2 p-3 rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      <div className="text-xs text-green-700 dark:text-green-300">
                        <div className="font-medium">Watcher Active</div>
                        <div className="text-green-600 dark:text-green-400 mt-0.5">
                          {watcherPath}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {tasks.map((task) => (
              <div
                key={task.taskUid}
                className="p-3 rounded border border-border bg-muted/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{task.taskName}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {task.canceled ? (
                        <span className="text-orange-600">Canceled</span>
                      ) : task.complete ? (
                        <>
                          {task.nErrors && task.nErrors > 0 ? (
                            <span className="text-amber-600">
                              Completed with {task.nErrors} error(s) •{" "}
                              {task.nIndexed || 0} indexed
                            </span>
                          ) : (
                            <span className="text-green-600">
                              Completed • {task.nIndexed || 0} indexed •{" "}
                              {Math.round((task.elapsedTime || 0) / 1000)}s
                            </span>
                          )}
                        </>
                      ) : task.taskProgress >= 0 ? (
                        <span>
                          {Math.round(task.taskProgress * 100)}% complete
                        </span>
                      ) : (
                        <span>Indexing...</span>
                      )}
                    </div>
                  </div>

                  {/* Cancel button for running tasks */}
                  {!task.complete && !task.canceled && (
                    <Button
                      onClick={() => handleCancelTask(task.taskUid)}
                      disabled={cancellingTasks.has(task.taskUid)}
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                    >
                      <X className="h-4 w-4 mr-1" />
                      {cancellingTasks.has(task.taskUid)
                        ? "Canceling..."
                        : "Cancel"}
                    </Button>
                  )}

                  {/* Progress bar */}
                  {!task.complete &&
                    !task.canceled &&
                    task.taskProgress >= 0 && (
                      <div className="w-24">
                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-primary h-full transition-all"
                            style={{ width: `${task.taskProgress * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                  {/* Status Icons */}
                  {task.complete && !task.canceled && (
                    <div>
                      {task.nErrors && task.nErrors > 0 ? (
                        <button
                          onClick={() => {
                            setErrorTask(task);
                            setErrorModalOpen(true);
                            setTasksModalOpen(false);
                          }}
                          className="text-amber-600 hover:text-amber-700 transition-colors"
                        >
                          <AlertCircle className="h-5 w-5" />
                        </button>
                      ) : (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Dialog>

      {/* Error Details Modal */}
      <Dialog
        open={errorModalOpen}
        onClose={() => setErrorModalOpen(false)}
        title="Indexing Errors"
        size="md"
      >
        <div className="p-6 space-y-4">
          {errorTask && (
            <>
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">Task:</span>{" "}
                  {errorTask.taskName}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Status:</span> Completed with
                  errors
                </div>
                <div className="text-sm">
                  <span className="font-medium">Files Indexed:</span>{" "}
                  {errorTask.nIndexed || 0}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Errors:</span>
                  <span className="text-red-600 ml-2 font-semibold">
                    {errorTask.nErrors}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-700 dark:text-red-300">
                  {errorTask.nErrors} file(s) failed to index. This could be due
                  to:
                </p>
                <ul className="text-xs text-red-700 dark:text-red-300 mt-2 list-disc list-inside space-y-1">
                  <li>Invalid DICOM format</li>
                  <li>Corrupted files</li>
                  <li>Missing permissions</li>
                  <li>Unsupported encoding</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
