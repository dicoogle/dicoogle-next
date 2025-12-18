import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { dicoogleService } from "@/services/dicoogleService";
import { useTaskStore } from "@/stores/TaskStore";
import { useAuthStore } from "@/stores/AuthStore";
import { toast } from "@/utils/toast";
import { AlertCircle, CheckCircle, Play, List } from "lucide-react";
import type { TaskInfo } from "@/types";

const INDEXING_TOAST_ID = "indexing-progress";

export function IndexerPage() {
  const { user } = useAuthStore();
  const { tasks, listTasks } = useTaskStore();
  
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [watcherPath, setWatcherPath] = useState("");
  const [watcherEnabled, setWatcherEnabled] = useState(false);
  const [watcherLoading, setWatcherLoading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  
  // Modals
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorTask, setErrorTask] = useState<TaskInfo | null>(null);
  
  // Task polling
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const lastNotifiedTaskRef = useRef<string | null>(null);
  const currentTaskRef = useRef<string | null>(null);

  useEffect(() => {
    loadSettings();
    listTasks();
    
    // Poll for task updates every 2 seconds
    const interval = setInterval(() => {
      listTasks();
    }, 2000);
    setPollInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
      // Dismiss any active indexing toasts when component unmounts
      toast.dismiss(INDEXING_TOAST_ID);
    };
  }, []);

  // Monitor task completion and show appropriate toast
  useEffect(() => {
    if (tasks.length === 0) {
      // No tasks - dismiss any loading toast
      if (currentTaskRef.current) {
        toast.dismiss(INDEXING_TOAST_ID);
        currentTaskRef.current = null;
      }
      return;
    }

    const latestTask = tasks[0]; // Most recent task

    if (latestTask.complete) {
      // Task completed
      if (latestTask.taskUid !== lastNotifiedTaskRef.current) {
        // Dismiss the loading toast
        toast.dismiss(INDEXING_TOAST_ID);
        currentTaskRef.current = null;
        lastNotifiedTaskRef.current = latestTask.taskUid;

        // Clear the polling interval when task completes
        if (pollInterval) {
          clearInterval(pollInterval);
          setPollInterval(null);
        }

        if (latestTask.nErrors && latestTask.nErrors > 0) {
          // Completed with errors - use warning
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
        } else {
          // Completed successfully
          toast.success(
            `Indexing completed! ${latestTask.nIndexed || 0} files indexed in ${Math.round((latestTask.elapsedTime || 0) / 1000)}s`
          );
        }
      }
    } else {
      // Task in progress
      if (currentTaskRef.current !== latestTask.taskUid) {
        // New task started
        currentTaskRef.current = latestTask.taskUid;
      }

      // Update the same toast with progress
      if (latestTask.taskProgress >= 0) {
        const progress = Math.round(latestTask.taskProgress * 100);
        toast.loading(`Indexing... ${progress}%`, INDEXING_TOAST_ID);
      } else {
        toast.loading("Indexing...", INDEXING_TOAST_ID);
      }
    }
  }, [tasks]);

  const loadSettings = async () => {
    try {
      setLoadingSettings(true);
      const settings = await dicoogleService.getIndexerSettings();
      if (settings.path) setWatcherPath(settings.path);
      if (settings.watcher) setWatcherEnabled(settings.watcher);
    } catch (err) {
      console.error("Failed to load indexer settings", err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleStartIndex = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) {
      toast.error("Please enter a path");
      return;
    }

    setLoading(true);
    try {
      await dicoogleService.index(path);
      setPath("");
      // Initial task list update
      await listTasks();
    } catch (err) {
      toast.error("Failed to start indexing");
    } finally {
      setLoading(false);
    }
  };

  const handleSetWatcherPath = async () => {
    if (!watcherPath.trim()) {
      toast.error("Please enter a path");
      return;
    }

    setWatcherLoading(true);
    try {
      await dicoogleService.setIndexerSettings({
        path: watcherPath,
        watcher: watcherEnabled,
      });
      toast.success("Watcher path set");
      await loadSettings();
    } catch (err) {
      toast.error("Failed to set watcher path");
    } finally {
      setWatcherLoading(false);
    }
  };

  const handleToggleWatcher = async (enable: boolean) => {
    if (!watcherPath.trim()) {
      toast.error("Please enter a watcher path first");
      return;
    }

    setWatcherLoading(true);
    try {
      await dicoogleService.setIndexerSettings({
        path: watcherPath,
        watcher: enable,
      });
      setWatcherEnabled(enable);
      toast.success(enable ? "Watcher enabled" : "Watcher disabled");
    } catch (err) {
      toast.error(`Failed to ${enable ? "enable" : "disable"} watcher`);
    } finally {
      setWatcherLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-card/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-2xl font-bold text-foreground">Indexer</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Index DICOM files from specified paths
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            {/* Indexing Form */}
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-4">Start Indexing</h3>
              <form onSubmit={handleStartIndex} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    File Path
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      placeholder="/path/to/dicom/files"
                      required
                    />
                    <Button
                      type="submit"
                      disabled={loading}
                      className="shrink-0"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start
                    </Button>
                  </div>
                </div>
              </form>
            </Card>

            {/* Watcher Settings (Admin only) */}
            {user?.admin && (
              <Card className="p-5 border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
                <h3 className="text-sm font-semibold mb-4">Auto-Indexing Watcher</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Set a path to automatically index new DICOM files as they arrive.
                </p>
                {loadingSettings ? (
                  <div className="text-sm text-muted-foreground">Loading settings...</div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Watcher Path
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={watcherPath}
                          onChange={(e) => setWatcherPath(e.target.value)}
                          placeholder="/path/to/watch"
                          disabled={loadingSettings}
                        />
                        <Button
                          onClick={handleSetWatcherPath}
                          disabled={watcherLoading || loadingSettings}
                          variant="outline"
                          className="shrink-0"
                        >
                          {watcherLoading ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>

                    {watcherPath && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleToggleWatcher(true)}
                          disabled={watcherLoading || watcherEnabled}
                          variant={watcherEnabled ? "outline" : "default"}
                          className="flex-1 shrink-0"
                        >
                          Enable Watcher
                        </Button>
                        <Button
                          onClick={() => handleToggleWatcher(false)}
                          disabled={watcherLoading || !watcherEnabled}
                          variant={watcherEnabled ? "destructive" : "outline"}
                          className="flex-1 shrink-0"
                        >
                          Disable Watcher
                        </Button>
                      </div>
                    )}

                    {watcherEnabled && watcherPath && (
                      <div className="flex items-center gap-2 p-3 rounded bg-green-50 dark:bg-green-900/20">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-green-700 dark:text-green-300">
                          Watcher is active for: {watcherPath}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* Tasks Button */}
            {tasks.length > 0 && (
              <div className="flex justify-end">
                <Button
                  onClick={() => setTasksModalOpen(true)}
                  variant="outline"
                  className="gap-2"
                >
                  <List className="h-4 w-4" />
                  Tasks ({tasks.length})
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

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
                      {task.complete ? (
                        <>
                          {task.nErrors && task.nErrors > 0 ? (
                            <span className="text-amber-600">
                              Completed with {task.nErrors} error(s) • {task.nIndexed || 0} indexed
                            </span>
                          ) : (
                            <span className="text-green-600">
                              Completed • {task.nIndexed || 0} indexed • {Math.round((task.elapsedTime || 0) / 1000)}s
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

                  {/* Progress bar */}
                  {!task.complete && task.taskProgress >= 0 && (
                    <div className="w-24">
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all"
                          style={{ width: `${task.taskProgress * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Status Icon */}
                  {task.complete && (
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
                  <span className="font-medium">Task:</span> {errorTask.taskName}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Status:</span> Completed with errors
                </div>
                <div className="text-sm">
                  <span className="font-medium">Files Indexed:</span> {errorTask.nIndexed || 0}
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
                  {errorTask.nErrors} file(s) failed to index. This could be due to:
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
