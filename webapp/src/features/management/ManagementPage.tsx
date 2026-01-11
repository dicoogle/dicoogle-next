import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useEnabledPlugins } from "@/plugin-system";
import { Suspense } from "react";

type TabType =
  | "services"
  | "plugins"
  | "users"
  | "system"
  | "transfer"
  | string;

export function ManagementPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const plugins = useEnabledPlugins();

  // Get settings extensions from all enabled plugins
  const settingsExtensions = plugins.flatMap((p) =>
    p.getSettingsExtensions ? p.getSettingsExtensions() : [],
  );

  const getActiveTab = (): TabType => {
    const pathParts = location.pathname.split("/");
    if (pathParts.length >= 3) {
      return pathParts[2];
    }
    return "services";
  };

  const activeTab = getActiveTab();

  const handleTabChange = (tab: TabType) => {
    navigate(`/management/${tab}`);
  };

  if (
    location.pathname === "/management" ||
    location.pathname === "/management/"
  ) {
    return <Navigate to="/management/services" replace />;
  }

  const coreTabs: { id: TabType; label: string }[] = [
    { id: "services", label: "Services" },
    { id: "plugins", label: "Plugins" },
    { id: "users", label: "Users" },
    { id: "transfer", label: "Transfer" },
    { id: "system", label: "System" },
  ];

  // Check if current tab is a plugin settings tab
  const isPluginTab = !coreTabs.some((t) => t.id === activeTab);
  const activeSettingsExt = settingsExtensions.find(
    (ext) => ext.id === activeTab,
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-foreground">Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure services, plugins, and view system information
          </p>
        </div>
      </div>

      <div className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto" aria-label="Tabs">
            {coreTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 capitalize transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {tab.label}
              </button>
            ))}

            {settingsExtensions
              .sort((a, b) => (a.order || 999) - (b.order || 999))
              .map((ext) => (
                <button
                  key={ext.id}
                  onClick={() => handleTabChange(ext.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                    activeTab === ext.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  {ext.icon}
                  {ext.label}
                </button>
              ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<div>Loading...</div>}>
          {isPluginTab && activeSettingsExt ? (
            (() => {
              const SettingsComponent = activeSettingsExt.component;
              return <SettingsComponent />;
            })()
          ) : (
            <Outlet />
          )}
        </Suspense>
      </div>
    </div>
  );
}
