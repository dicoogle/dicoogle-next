import { create } from "zustand";
import { dicoogleService } from "@/services/dicoogleService";
import type { LoginResponse, LoginCredentials } from "@/types";

interface AuthState {
  isAuthenticated: boolean;
  user: LoginResponse | null;
  loading: boolean;
  authLoading: boolean; // New: loading state for initial auth check
  error: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => void;
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

      if (response.success && response.token) {
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

  checkAuth: async () => {
    set({ authLoading: true });
    
    // Check if user has valid token in localStorage
    const token = localStorage.getItem("dicoogle_token");

    if (!token) {
      set({ isAuthenticated: false, user: null, authLoading: false });
      return;
    }

    // Validate token with backend
    try {
      const response = await dicoogleService.validateToken();

      if (response.success) {
        set({ isAuthenticated: true, user: response, authLoading: false });
      } else {
        set({ isAuthenticated: false, user: null, authLoading: false });
      }
    } catch (error) {
      set({ isAuthenticated: false, user: null, authLoading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
