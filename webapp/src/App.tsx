import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/AuthStore";
import { LoginPage } from "@/features/auth/LoginPage";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { MainLayout } from "./components/layout/MainLayout";
import { SearchPage } from "./features/search/SearchPage";
import { ManagementPage } from "./features/management/ManagementPage";
import { ServiceSettings } from "./features/management/components/ServiceSettings";
import { PluginSettings } from "./features/management/components/PluginSettings";
import { SystemInfo } from "./features/management/components/SystemInfo";
import { UserManagement } from "./features/management/components/UserManagement";
import { TransferSettings } from "./features/management/components/TransferSettings";
import { Toaster } from "sonner";
import { useRouteExtensions } from "@/plugin-system";
import { Suspense } from "react";

function App() {
  const { isAuthenticated, authLoading, checkAuth } = useAuthStore();
  const pluginRoutes = useRouteExtensions();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || "/experimental"}>
      <Toaster
        position="top-right"
        expand={false}
        richColors
        closeButton
        duration={4000}
      />
      <MainLayout>
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected routes */}
            <Route
              path="/search"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated}>
                  <SearchPage />
                </ProtectedRoute>
              }
            />

            {/* Admin-only management routes */}
            <Route
              path="/management"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated}>
                  <AdminRoute>
                    <ManagementPage />
                  </AdminRoute>
                </ProtectedRoute>
              }
            >
              <Route path="services" element={<ServiceSettings />} />
              <Route path="plugins" element={<PluginSettings />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="transfer" element={<TransferSettings />} />
              <Route path="system" element={<SystemInfo />} />
              <Route path="*" element={null} />
            </Route>

            {/* Plugin routes - dynamically loaded based on enabled plugins */}
            {pluginRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <route.component />
                  </ProtectedRoute>
                }
              />
            ))}

            {/* Default redirect */}
            <Route
              path="/"
              element={
                isAuthenticated ? (
                  <Navigate to="/search" replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />

            {/* 404 - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </MainLayout>
    </BrowserRouter>
  );
}

export default App;
