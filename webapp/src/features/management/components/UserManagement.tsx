// webapp/src/features/management/components/UserManagement.tsx
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { dicoogleService } from "@/services/dicoogleService";
import { toast } from "@/utils/toast";
import { Trash2, UserPlus, Shield, Pencil } from "lucide-react";
import { type User } from "@/types/index";

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ username: "", password: "", admin: false });
  
  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ password: "", admin: false });
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const list = await dicoogleService.getUsers();
      setUsers(list);
    } catch (err) {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password) return;

    try {
      await dicoogleService.createUser(newUser.username, newUser.password, newUser.admin);
      toast.success(`User ${newUser.username} created${newUser.admin ? ' as admin' : ''}`);
      setNewUser({ username: "", password: "", admin: false });
      loadUsers();
    } catch (err) {
      toast.error("Failed to create user");
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!confirm(`Are you sure you want to delete user ${username}?`)) return;
    try {
      await dicoogleService.deleteUser(username);
      toast.success("User deleted");
      loadUsers();
    } catch (err) {
      toast.error("Failed to delete user");
    }
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setEditForm({
      password: "",
      admin: user.roles?.includes('admin') || false,
    });
    setEditModalOpen(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editForm.password) {
      toast.error("Password is required");
      return;
    }

    setEditLoading(true);
    try {
      await dicoogleService.updateUser(
        editingUser.username,
        editForm.password,
        editForm.admin
      );
      toast.success(`User ${editingUser.username} updated`);
      setEditModalOpen(false);
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      toast.error("Failed to update user");
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User List */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Users</h2>
            <p className="text-sm text-muted-foreground">
              Manage system users and access.
            </p>
          </div>

          {loading ? (
            <div>Loading...</div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <Card
                  key={user.username}
                  className="p-4 flex justify-between items-center"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-medium">{user.username}</span>
                      {user.roles?.includes('admin') && (
                        <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200">
                          <Shield className="h-3 w-3" />
                          Admin
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      onClick={() => handleOpenEdit(user)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteUser(user.username)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Add User Form */}
        <div>
          <Card className="p-5 sticky top-24">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Add User
            </h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Username</label>
                <Input
                  value={newUser.username}
                  onChange={(e) =>
                    setNewUser({ ...newUser, username: e.target.value })
                  }
                  placeholder="jdoe"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Password</label>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  placeholder="••••••"
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="admin-checkbox"
                  checked={newUser.admin}
                  onChange={(e) =>
                    setNewUser({ ...newUser, admin: e.target.checked })
                  }
                  className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary focus:ring-2"
                />
                <label htmlFor="admin-checkbox" className="text-sm font-medium flex items-center gap-1.5 cursor-pointer">
                  <Shield className="h-3.5 w-3.5 text-yellow-600" />
                  Administrator
                </label>
              </div>
              <Button type="submit" className="w-full">
                Create User
              </Button>
            </form>
          </Card>
        </div>
      </div>

      {/* Edit User Modal */}
      <Dialog
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit User"
        size="sm"
      >
        <form onSubmit={handleEditUser} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">
              Username
            </label>
            <div className="px-3 py-2 bg-muted/50 rounded border text-sm font-mono">
              {editingUser?.username}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Username cannot be changed
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">New Password</label>
            <Input
              type="password"
              value={editForm.password}
              onChange={(e) =>
                setEditForm({ ...editForm, password: e.target.value })
              }
              placeholder="Enter new password"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              User will be recreated with this new password
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit-admin-checkbox"
              checked={editForm.admin}
              onChange={(e) =>
                setEditForm({ ...editForm, admin: e.target.checked })
              }
              className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary focus:ring-2"
            />
            <label htmlFor="edit-admin-checkbox" className="text-sm font-medium flex items-center gap-1.5 cursor-pointer">
              <Shield className="h-3.5 w-3.5 text-yellow-600" />
              Administrator
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditModalOpen(false)}
              className="flex-1"
              disabled={editLoading}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={editLoading}>
              {editLoading ? "Updating..." : "Update User"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
