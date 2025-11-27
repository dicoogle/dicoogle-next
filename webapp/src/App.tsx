import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/AuthStore";
import { LoginPage } from "@/features/auth/LoginPage";
import { ProtectedRoute } from "@/components/ProtectedRoute";

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore();

  useEffect(() => {
    // Check authentication on app load
    checkAuth();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes */}
        <Route
          path="/search"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <div>Not Implemented</div>
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
    </BrowserRouter>
  );
}

export default App;
