import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/AuthStore";

type MainLayoutProps = {
  children: React.ReactNode;
};

export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuthStore();

  // Don’t show top bar on login route
  const isLoginPage = location.pathname === "/login";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // On login page, just render children
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="w-full border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Left: logo + title */}
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate("/search")}
          >
            <img
              src="/logo.png"
              alt="Dicoogle Logo"
              className="w-32 h-16 rounded-md object-contain"
            />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-sm sm:text-base">
                Dicoogle Next
              </span>
              <span className="text-xs text-muted-foreground">PACS Viewer</span>
            </div>
          </div>

          {/* Middle: navigation */}
          {isAuthenticated && (
            <nav className="hidden sm:flex items-center gap-4 text-sm">
              <button
                onClick={() => navigate("/search")}
                className={`px-3 py-1 rounded-md hover:bg-muted ${
                  location.pathname.startsWith("/search")
                    ? "bg-muted font-medium"
                    : ""
                }`}
              >
                Search
              </button>
            </nav>
          )}

          {/* Right: user info + logout */}
          {isAuthenticated && (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-sm font-medium">
                  {user?.user ?? "User"}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs sm:text-sm px-3 py-1.5 rounded-md border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
