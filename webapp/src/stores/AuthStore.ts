import { create } from "zustand";
import { apiService } from "@/services/api";
import type { User, LoginCredentials } from "@/types";

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
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
  error: null,

  login: async (credentials: LoginCredentials) => {
    set({ loading: true, error: null });

    try {
      const response = await apiService.login(credentials);

      if (response.success && response.user) {
        set({
          isAuthenticated: true,
          user: response.user,
          loading: false,
          error: null,
        });
      } else {
        set({
          isAuthenticated: false,
          user: null,
          loading: false,
          error: response.message || "Login failed",
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
      await apiService.logout();
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
    // Check if user has valid token in localStorage
    const token = localStorage.getItem("dicoogle_token");

    if (!token) {
      set({ isAuthenticated: false, user: null });
      return;
    }

    // Validate token with backend by calling GET /login
    try {
      console.log("[Auth] Validating stored token...");
      const isValid = await apiService.validateToken();

      if (isValid) {
        console.log("[Auth] Token is valid");
        set({ isAuthenticated: true });
      } else {
        console.log("[Auth] Token is invalid");
        set({ isAuthenticated: false, user: null });
      }
    } catch (error) {
      console.error("[Auth] Token validation error:", error);
      set({ isAuthenticated: false, user: null });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
