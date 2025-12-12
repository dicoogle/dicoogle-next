import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";

type TabType = "services" | "plugins" | "system";

export function ManagementPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine active tab from current route
  const getActiveTab = (): TabType => {
    if (location.pathname.includes("/plugins")) return "plugins";
    if (location.pathname.includes("/system")) return "system";
    return "services";
  };

  const activeTab = getActiveTab();

  const handleTabChange = (tab: TabType) => {
    navigate(`/management/${tab}`);
  };

  // Redirect /management to /management/services
  if (location.pathname === "/management" || location.pathname === "/management/") {
    return <Navigate to="/management/services" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-foreground">Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure services, plugins, and view system information
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto" aria-label="Tabs">
            {(["services", "plugins", "system"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 capitalize transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {tab === "plugins"
                  ? "Plugins"
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </div>
    </div>
  );
}
