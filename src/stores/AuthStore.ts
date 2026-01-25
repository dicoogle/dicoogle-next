import { create } from "zustand";
import { dicoogleService } from "@/services/dicoogleService";
import type { LoginResponse, LoginCredentials } from "@/types";

interface AuthState {
  isAuthenticated: boolean;
  user: LoginResponse | null;
  loading: boolean;
  authLoading: boolean; // Loading state for initial auth check
  error: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  loading: false,
  authLoading: true, // Start as true to prevent premature redirects
  error: null,

  login: async (credentials: LoginCredentials) => {
    set({ loading: true, error: null });

    try {
      const response = await dicoogleService.login(credentials);

      if (response.success) {
        set({
          isAuthenticated: true,
          user: response,
          loading: false,
          error: null,
        });
      } else {
        set({
          isAuthenticated: false,
          user: null,
          loading: false,
          error: "Login failed",
        });
      }
    } catch (error: any) {
      set({
        isAuthenticated: false,
        user: null,
        loading: false,
        error: error.message || "An error occurred during login",
      });
    }
  },

  logout: async () => {
    try {
      await dicoogleService.logout();
    } finally {
      set({
        isAuthenticated: false,
        user: null,
        loading: false,
        error: null,
      });
    }
  },

  // Check authentication on app load
  // Uses dicoogleService.isAuthenticated() which relies on
  // the dicoogle-client-js library's internal session management
  checkAuth: async () => {
    set({ authLoading: true });

    try {
      const isAuth = await dicoogleService.isAuthenticated();

      if (isAuth) {
        // Get user info from the service
        const userInfo = await dicoogleService.getUserInfo();
        set({ isAuthenticated: true, user: userInfo, authLoading: false });
      } else {
        set({ isAuthenticated: false, user: null, authLoading: false });
      }
    } catch (error) {
      console.error("[AuthStore] Auth check failed:", error);
      set({ isAuthenticated: false, user: null, authLoading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
