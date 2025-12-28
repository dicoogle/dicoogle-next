import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/AuthStore";
import { IndexerModal } from "@/features/indexer/IndexerModal";
import { useSidebarMenuExtensions } from "@/plugins";

type MainLayoutProps = {
  children: React.ReactNode;
};

export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuthStore();
  const [indexerModalOpen, setIndexerModalOpen] = useState(false);

  const pluginMenuItems = useSidebarMenuExtensions();

  // Don't show top bar on login route
  const isLoginPage = location.pathname === "/login";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // On login page, just render children
  if (isLoginPage) {
    return <>{children}</>;
  }

  const isActivePath = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

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
          </div>

          {/* Middle: navigation */}
          {isAuthenticated && (
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              {/* Core entries */}
              <button
                onClick={() => navigate("/search")}
                className={`px-3 py-1 rounded-md hover:bg-muted transition-colors ${
                  location.pathname.startsWith("/search")
                    ? "bg-muted font-medium"
                    : ""
                }`}
              >
                Search
              </button>
              <button
                onClick={() => setIndexerModalOpen(true)}
                className="px-3 py-1 rounded-md hover:bg-muted transition-colors"
              >
                Indexer
              </button>
              {user?.admin && (
                <button
                  onClick={() => navigate("/management")}
                  className={`px-3 py-1 rounded-md hover:bg-muted transition-colors ${
                    location.pathname.startsWith("/management")
                      ? "bg-muted font-medium"
                      : ""
                  }`}
                >
                  Management
                </button>
              )}

              {/* Plugin-provided entries */}
              {pluginMenuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  className={`px-3 py-1 rounded-md hover:bg-muted transition-colors ${
                    isActivePath(item.path) ? "bg-muted font-medium" : ""
                  }`}
                >
                  {item.label}
                </button>
              ))}
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

      {/* Indexer Modal */}
      <IndexerModal
        open={indexerModalOpen}
        onClose={() => setIndexerModalOpen(false)}
      />
    </div>
  );
}
