import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  apiService,
  type ServiceStatus,
  type StorageServer,
} from "@/services/api";
import { toast } from "@/utils/toast";
import { X } from "lucide-react";

interface ServiceConfig {
  id: "storage" | "query";
  name: string;
  description: string;
  getStatus: () => Promise<ServiceStatus>;
  setStatus: (status: Partial<ServiceStatus>) => Promise<void>;
}

interface ServiceSettingsProps {
  onSave: () => void;
}

export function ServiceSettings({ onSave }: ServiceSettingsProps) {
  const serviceConfigs: ServiceConfig[] = [
    {
      id: "storage",
      name: "DICOM Storage Service",
      description: "DICOM C-STORE service for receiving medical images",
      getStatus: () => apiService.getStorageStatus(),
      setStatus: (status) => apiService.setStorageStatus(status),
    },
    {
      id: "query",
      name: "DICOM Query Service",
      description: "DICOM C-FIND and C-GET query service",
      getStatus: () => apiService.getQueryStatus(),
      setStatus: (status) => apiService.setQueryStatus(status),
    },
  ];

  const [services, setServices] = useState<Map<string, ServiceStatus>>(
    new Map(),
  );
  const [storageServers, setStorageServers] = useState<StorageServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [editingPort, setEditingPort] = useState<number>(0);
  const [editingHostname, setEditingHostname] = useState<string>("");

  // Storage server form
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState<StorageServer>({
    AETitle: "",
    ipAddrs: "",
    port: 104,
    description: "",
  });

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    await Promise.all([loadServices(), loadStorageServers()]);
  };

  const loadServices = async () => {
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
  };

  const loadStorageServers = async () => {
    try {
      const servers = await apiService.getStorageServers();
      setStorageServers(servers);
    } catch (err) {
      console.error("Failed to load storage servers:", err);
    }
  };

  const handleToggleService = async (id: string) => {
    const service = services.get(id);
    if (!service) return;

    const config = serviceConfigs.find((c) => c.id === id);
    if (!config) return;

    try {
      await config.setStatus({ running: !service.isRunning });
      await loadServices();
      toast.success(
        `${config.name} ${!service.isRunning ? "started" : "stopped"}`,
      );
      onSave();
    } catch (err) {
      toast.error(`Failed to toggle ${config.name}`);
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

  const handleSave = async (id: string) => {
    const config = serviceConfigs.find((c) => c.id === id);
    if (!config) return;

    try {
      await config.setStatus({
        port: editingPort,
        hostname: editingHostname,
      });
      await loadServices();
      setEditingService(null);
      toast.success(`${config.name} settings updated`);
      onSave();
    } catch (err) {
      toast.error(`Failed to update ${config.name} settings`);
      console.error(err);
    }
  };

  const handleCancel = () => {
    setEditingService(null);
  };

  const handleAddServer = async () => {
    if (!newServer.AETitle || !newServer.ipAddrs) {
      toast.error("AE Title and IP Address are required");
      return;
    }

    try {
      await apiService.addStorageServer(newServer);
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
      await apiService.removeStorageServer(server);
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

        <div className="space-y-4">
          {serviceConfigs.map((config) => {
            const service = services.get(config.id);
            if (!service) return null;
            const isEditing = editingService === config.id;

            return (
              <Card key={config.id} className="p-5">
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
