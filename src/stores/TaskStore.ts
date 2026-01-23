import { create } from "zustand";
import { dicoogleService } from "@/services/dicoogleService";
import type { TaskInfo } from "@/types";

interface TaskState {
  tasks: TaskInfo[];
  loading: boolean;
  error: string | null;

  // Actions
  listTasks: () => Promise<void>;
  stopTask: (taskUid: string) => Promise<void>;
  closeTask: (taskUid: string) => Promise<void>;
  clearError: () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  loading: false,
  error: null,

  listTasks: async () => {
    set({ loading: true, error: null });
    try {
      const outcome = await dicoogleService.listTasks();
      set({ tasks: outcome.tasks, loading: false });
    } catch (error: any) {
      set({
        error: error.message || "Failed to load tasks",
        loading: false,
      });
    }
  },

  stopTask: async (taskUid: string) => {
    try {
      await dicoogleService.stopTask(taskUid);
      // Refresh task list after stopping
      const outcome = await dicoogleService.listTasks();
      set({ tasks: outcome.tasks });
    } catch (error: any) {
      set({ error: error.message || "Failed to stop task" });
    }
  },

  closeTask: async (taskUid: string) => {
    try {
      await dicoogleService.closeTask(taskUid);
      // Refresh task list after closing
      const outcome = await dicoogleService.listTasks();
      set({ tasks: outcome.tasks });
    } catch (error: any) {
      set({ error: error.message || "Failed to close task" });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
