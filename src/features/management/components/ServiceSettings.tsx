import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { dicoogleService } from "@/services/dicoogleService";
import { toast } from "@/utils/toast";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import {
  ServiceRequest,
  type ServiceStatus,
  type StorageServer,
  type QuerySettings,
} from "@/types/index";

interface ServiceConfig {
  id: "storage" | "query";
  name: string;
  description: string;
  getStatus: () => Promise<ServiceStatus>;
  setStatus: (status: Partial<ServiceStatus>) => Promise<void>;
}

const serviceConfigs: ServiceConfig[] = [
  {
    id: "storage",
    name: "DICOM Storage Service",
    description: "DICOM C-STORE service for receiving medical images",
    getStatus: () => dicoogleService.getStorageStatus(),
    setStatus: (status) => dicoogleService.setStorageStatus(status),
  },
  {
    id: "query",
    name: "DICOM Query Service",
    description: "DICOM C-FIND and C-MOVE query service",
    getStatus: () => dicoogleService.getQueryStatus(),
    setStatus: (status) => dicoogleService.setQueryStatus(status),
  },
];

export function ServiceSettings() {
  const [services, setServices] = useState<Map<string, ServiceStatus>>(
    new Map(),
  );
  const [storageServers, setStorageServers] = useState<StorageServer[]>([]);
  const [querySettings, setQuerySettings] = useState<QuerySettings | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [editingPort, setEditingPort] = useState<number>(0);
  const [editingHostname, setEditingHostname] = useState<string>("");
  const [showQuerySettings, setShowQuerySettings] = useState(false);
  const [editingQuerySettings, setEditingQuerySettings] = useState(false);
  const [editedQuerySettings, setEditedQuerySettings] =
    useState<QuerySettings | null>(null);

  // Storage server form
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState<StorageServer>({
    AETitle: "",
    ipAddrs: "",
    port: 104,
    description: "",
  });

  // 2. MEMOIZED FUNCTIONS: Wrapped in useCallback
  const loadServices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const newServices = new Map<string, ServiceStatus>();

      for (const config of serviceConfigs) {
        try {
          const status = await config.getStatus();
          newServices.set(config.id, status);
        } catch (err) {
          console.error(`Failed to load ${config.id} status:`, err);
        }
      }

      setServices(newServices);
    } catch (err) {
      setError("Failed to load services");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []); // No dependencies needed as serviceConfigs is external and stable

  const loadStorageServers = useCallback(async () => {
    try {
      const servers = await dicoogleService.getStorageServers();
      setStorageServers(servers);
    } catch (err) {
      console.error("Failed to load storage servers:", err);
    }
  }, []);

  const loadQuerySettings = useCallback(async () => {
    try {
      const settings = await dicoogleService.getQueryRetrieveSettings();
      setQuerySettings(settings);
    } catch (err) {
      console.error("Failed to load query settings:", err);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([
      loadServices(),
      loadStorageServers(),
      loadQuerySettings(),
    ]);
  }, [loadServices, loadStorageServers, loadQuerySettings]);

  // 3. UPDATED USEEFFECT: Safe to include loadAll now
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleToggleService = async (id: string) => {
    const service = services.get(id);
    if (!service) return;

    const config = serviceConfigs.find((c) => c.id === id);
    if (!config) return;

    const newValue = !service.isRunning;

    try {
      await config.setStatus({ isRunning: newValue });

      if (id === "storage") {
        await dicoogleService.setStorageStatus({ running: newValue });
      } else if (id === "query") {
        await dicoogleService.setQueryStatus({ running: newValue });
      }

      await loadServices();

      toast.success(`${config.name} ${newValue ? "started" : "stopped"}`);
    } catch (err) {
      toast.error(`Failed to toggle ${config.name}`);
      console.error(err);
      await config.setStatus({ isRunning: !service.isRunning });

      await loadServices();
    }
  };

  const handleSave = async (id: string) => {
    const config = serviceConfigs.find((c) => c.id === id);
    if (!config) return;

    const newValue: Partial<ServiceRequest> = {
      port: editingPort,
      hostname: editingHostname,
    };

    try {
      await config.setStatus(newValue);

      if (id === "storage") {
        await dicoogleService.setStorageStatus(newValue);
      } else if (id === "query") {
        await dicoogleService.setQueryStatus(newValue);
      }
      await loadServices();
      setEditingService(null);
      toast.success(`${config.name} settings updated`);
    } catch (err) {
      toast.error(`Failed to update ${config.name} settings`);
      console.error(err);
    }
  };

  const handleStartEdit = (id: string) => {
    const service = services.get(id);
    if (!service) return;
    setEditingService(id);
    setEditingPort(service.port);
    setEditingHostname(service.hostname || "0.0.0.0");
  };

  const handleCancel = () => {
    setEditingService(null);
  };

  const handleStartEditQuerySettings = () => {
    if (!querySettings) return;
    setEditedQuerySettings({ ...querySettings });
    setEditingQuerySettings(true);
  };

  const handleCancelQuerySettings = () => {
    setEditingQuerySettings(false);
    setEditedQuerySettings(null);
  };

  const handleSaveQuerySettings = async () => {
    if (!editedQuerySettings) return;

    try {
      await dicoogleService.setQueryRetrieveSettings(editedQuerySettings);
      await loadQuerySettings();
      setEditingQuerySettings(false);
      setEditedQuerySettings(null);
      toast.success("Query settings updated successfully");
    } catch (err) {
      toast.error("Failed to save query settings");
      console.error(err);
    }
  };

  const handleAddServer = async () => {
    if (!newServer.AETitle || !newServer.ipAddrs) {
      toast.error("AE Title and IP Address are required");
      return;
    }

    try {
      await dicoogleService.addStorageServer(newServer);
      await loadStorageServers();
      setShowAddServer(false);
      setNewServer({
        AETitle: "",
        ipAddrs: "",
        port: 104,
        description: "",
      });
      toast.success("Storage server added successfully");
    } catch (err) {
      toast.error("Failed to add storage server");
      console.error(err);
    }
  };

  const handleRemoveServer = async (server: StorageServer) => {
    try {
      await dicoogleService.removeStorageServer(server);
      await loadStorageServers();
      toast.success("Storage server removed");
    } catch (err) {
      toast.error("Failed to remove storage server");
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading services...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* DICOM Services Section */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          DICOM Services
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Start, stop, and configure Dicoogle DICOM services
        </p>

        {error && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 text-sm border border-red-200 dark:border-red-800 mb-4">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          {serviceConfigs.map((config) => {
            const service = services.get(config.id);
            if (!service) return null;
            const isEditing = editingService === config.id;

            return (
              <Card key={config.id} className="p-5 flex-1 min-w-[400px]">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-semibold text-foreground">
                        {config.name}
                      </h3>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          service.isRunning
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                        }`}
                      >
                        {service.isRunning ? "✓ Running" : "✕ Stopped"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      {config.description}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Port */}
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">
                          Port
                        </label>
                        {isEditing ? (
                          <Input
                            type="number"
                            value={editingPort}
                            onChange={(e) =>
                              setEditingPort(Number(e.target.value))
                            }
                            className="h-9"
                          />
                        ) : (
                          <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md">
                            {service.port}
                          </div>
                        )}
                      </div>

                      {/* Hostname */}
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">
                          Hostname
                        </label>
                        {isEditing ? (
                          <Input
                            type="text"
                            value={editingHostname}
                            onChange={(e) => setEditingHostname(e.target.value)}
                            placeholder="0.0.0.0"
                            className="h-9"
                          />
                        ) : (
                          <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md">
                            {service.hostname || "0.0.0.0"}
                          </div>
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleSave(config.id)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancel}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}

                    {/* Query Settings - Show only for query service */}
                    {config.id === "query" && querySettings && (
                      <div className="mt-4 border-t pt-4">
                        <button
                          onClick={() =>
                            setShowQuerySettings(!showQuerySettings)
                          }
                          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {showQuerySettings ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          Advanced Query Settings
                        </button>

                        {showQuerySettings && (
                          <div className="mt-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                  Accept Timeout (ms)
                                </label>
                                {editingQuerySettings && editedQuerySettings ? (
                                  <Input
                                    type="number"
                                    value={editedQuerySettings.acceptTimeout}
                                    onChange={(e) =>
                                      setEditedQuerySettings({
                                        ...editedQuerySettings,
                                        acceptTimeout: Number(e.target.value),
                                      })
                                    }
                                    className="h-9"
                                  />
                                ) : (
                                  <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md">
                                    {querySettings.acceptTimeout}
                                  </div>
                                )}
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                  Connection Timeout (ms)
                                </label>
                                {editingQuerySettings && editedQuerySettings ? (
                                  <Input
                                    type="number"
                                    value={
                                      editedQuerySettings.connectionTimeout
                                    }
                                    onChange={(e) =>
                                      setEditedQuerySettings({
                                        ...editedQuerySettings,
                                        connectionTimeout: Number(
                                          e.target.value,
                                        ),
                                      })
                                    }
                                    className="h-9"
                                  />
                                ) : (
                                  <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md">
                                    {querySettings.connectionTimeout}
                                  </div>
                                )}
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                  Idle Timeout (ms)
                                </label>
                                {editingQuerySettings && editedQuerySettings ? (
                                  <Input
                                    type="number"
                                    value={editedQuerySettings.idleTimeout}
                                    onChange={(e) =>
                                      setEditedQuerySettings({
                                        ...editedQuerySettings,
                                        idleTimeout: Number(e.target.value),
                                      })
                                    }
                                    className="h-9"
                                  />
                                ) : (
                                  <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md">
                                    {querySettings.idleTimeout}
                                  </div>
                                )}
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                  Response Timeout (ms)
                                </label>
                                {editingQuerySettings && editedQuerySettings ? (
                                  <Input
                                    type="number"
                                    value={editedQuerySettings.responseTimeout}
                                    onChange={(e) =>
                                      setEditedQuerySettings({
                                        ...editedQuerySettings,
                                        responseTimeout: Number(e.target.value),
                                      })
                                    }
                                    className="h-9"
                                  />
                                ) : (
                                  <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md">
                                    {querySettings.responseTimeout}
                                  </div>
                                )}
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                  Max Associations
                                </label>
                                {editingQuerySettings && editedQuerySettings ? (
                                  <Input
                                    type="number"
                                    value={editedQuerySettings.maxAssociations}
                                    onChange={(e) =>
                                      setEditedQuerySettings({
                                        ...editedQuerySettings,
                                        maxAssociations: Number(e.target.value),
                                      })
                                    }
                                    className="h-9"
                                  />
                                ) : (
                                  <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md">
                                    {querySettings.maxAssociations}
                                  </div>
                                )}
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                  Max PDU Receive
                                </label>
                                {editingQuerySettings && editedQuerySettings ? (
                                  <Input
                                    type="number"
                                    value={editedQuerySettings.maxPduReceive}
                                    onChange={(e) =>
                                      setEditedQuerySettings({
                                        ...editedQuerySettings,
                                        maxPduReceive: Number(e.target.value),
                                      })
                                    }
                                    className="h-9"
                                  />
                                ) : (
                                  <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md">
                                    {querySettings.maxPduReceive}
                                  </div>
                                )}
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                  Max PDU Send
                                </label>
                                {editingQuerySettings && editedQuerySettings ? (
                                  <Input
                                    type="number"
                                    value={editedQuerySettings.maxPduSend}
                                    onChange={(e) =>
                                      setEditedQuerySettings({
                                        ...editedQuerySettings,
                                        maxPduSend: Number(e.target.value),
                                      })
                                    }
                                    className="h-9"
                                  />
                                ) : (
                                  <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md">
                                    {querySettings.maxPduSend}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex gap-2">
                              {editingQuerySettings ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={handleSaveQuerySettings}
                                  >
                                    Save Settings
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleCancelQuerySettings}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleStartEditQuerySettings}
                                >
                                  Edit Settings
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Control Buttons */}
                  <div className="ml-4 flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant={service.isRunning ? "destructive" : "default"}
                      onClick={() => handleToggleService(config.id)}
                    >
                      {service.isRunning ? "Stop" : "Start"}
                    </Button>
                    {!isEditing && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStartEdit(config.id)}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Storage Servers Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Storage Servers
            </h2>
            <p className="text-sm text-muted-foreground">
              Manage C-MOVE destinations (remote DICOM storage servers)
            </p>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={() => setShowAddServer(true)}
          >
            + Add Server
          </Button>
        </div>

        {/* Add Server Form */}
        {showAddServer && (
          <Card className="p-5 mb-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Add Storage Server
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  AE Title *
                </label>
                <Input
                  type="text"
                  value={newServer.AETitle}
                  onChange={(e) =>
                    setNewServer({ ...newServer, AETitle: e.target.value })
                  }
                  placeholder="REMOTE_PACS"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  IP Address *
                </label>
                <Input
                  type="text"
                  value={newServer.ipAddrs}
                  onChange={(e) =>
                    setNewServer({ ...newServer, ipAddrs: e.target.value })
                  }
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Port
                </label>
                <Input
                  type="number"
                  value={newServer.port}
                  onChange={(e) =>
                    setNewServer({ ...newServer, port: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Description
                </label>
                <Input
                  type="text"
                  value={newServer.description || ""}
                  onChange={(e) =>
                    setNewServer({ ...newServer, description: e.target.value })
                  }
                  placeholder="Optional description"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="default" onClick={handleAddServer}>
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddServer(false);
                  setNewServer({
                    AETitle: "",
                    ipAddrs: "",
                    port: 104,
                    description: "",
                  });
                }}
              >
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {/* Storage Servers List */}
        <div className="space-y-3">
          {storageServers.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm text-muted-foreground text-center py-4">
                No storage servers configured
              </p>
            </Card>
          ) : (
            storageServers.map((server) => (
              <Card key={server.AETitle} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        {server.AETitle}
                      </h4>
                    </div>
                    {server.description && (
                      <p className="text-xs text-muted-foreground mb-2">
                        {server.description}
                      </p>
                    )}
                    <div className="flex gap-4 text-xs">
                      <span className="text-muted-foreground">
                        <span className="font-medium">IP:</span>{" "}
                        {server.ipAddrs}
                      </span>
                      <span className="text-muted-foreground">
                        <span className="font-medium">Port:</span> {server.port}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveServer(server)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
