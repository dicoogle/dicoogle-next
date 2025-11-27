import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/AuthStore";
import { LoginPage } from "@/features/auth/LoginPage";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MainLayout } from "./components/layout/MainLayout";
import { SearchPage } from "./features/search/SearchPage";

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore();

  useEffect(() => {
    // Check authentication on app load
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <MainLayout>
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
      </MainLayout>
    </BrowserRouter>
  );
}

export default App;
