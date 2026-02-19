// src/pages/Users.tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/types/database";
import { Shield, Trash2, UserPlus, Users as UsersIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type AppRole = Database["public"]["Enums"]["app_role"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type Branch = {
  id: string;
  name: string;
  is_active: boolean;
  company_id?: string | null;
};

type UserRow = Profile & {
  branch?: { name: string } | null;
};

const ALL_ROLES: AppRole[] = ["admin", "cashier", "warehouse", "staff"];

export default function Users() {
  const { toast } = useToast();

  const {
    createEmployee,
    repairMissingCompanyId,
    deleteEmployee,
    updateEmployeeRoleBranch,
    setEmployeeFlag,
    profile: me,
    activeBranchId, // ✅ IMPORTANT: selected branch from admin selector
  } = useAuth() as any;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  // dialogs
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState<AppRole | "">("");
  const [editBranchId, setEditBranchId] = useState<string | "">("");

  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showDeleted, setShowDeleted] = useState(false);

  // prevent double submit
  const addInFlightRef = useRef(false);

  const [newEmployee, setNewEmployee] = useState({
    email: "",
    password: "",
    fullName: "",
    phone: "",
    role: "" as AppRole | "",
    branchId: "" as string | "",
  });

  const companyId = (me as any)?.company_id ?? null;

  const branchesById = useMemo(() => {
    const map = new Map<string, Branch>();
    branches.forEach((b) => map.set(b.id, b));
    return map;
  }, [branches]);

  const activeBranchName = useMemo(() => {
    if (!activeBranchId) return "All branches";
    return branchesById.get(String(activeBranchId))?.name ?? "Selected branch";
  }, [activeBranchId, branchesById]);

  // prevent double fetch storms
  const refreshingRef = useRef(false);
  const safeRefreshUsers = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      await fetchUsers();
    } finally {
      refreshingRef.current = false;
    }
  };

  // ✅ realtime refresh (scoped to company)
  useEffect(() => {
    if (!companyId) return;

    const ch = supabase
      .channel(`users-profiles-realtime-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `company_id=eq.${companyId}`,
        },
        () => void safeRefreshUsers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // ✅ Refetch when filters change (deleted toggle OR branch selection)
  useEffect(() => {
    if (!companyId) return;
    void fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeleted, companyId, activeBranchId]);

  // ✅ When companyId becomes available: repair + load lists
  useEffect(() => {
    if (!companyId) {
      setUsers([]);
      setBranches([]);
      setLoading(false);
      return;
    }

    void (async () => {
      setLoading(true);

      // 1) auto repair old users (company_id missing)
      try {
        const r = await repairMissingCompanyId();
        if (r?.error) {
          toast({
            title: "Warning",
            description: `Auto-repair skipped: ${r.error.message}`,
            variant: "destructive",
          });
        } else if ((r?.repaired ?? 0) > 0) {
          toast({
            title: "Employees fixed",
            description: `Repaired ${r.repaired} old employee(s) missing company_id.`,
          });
        }
      } catch (e: any) {
        toast({
          title: "Warning",
          description: `Auto-repair error: ${e?.message ?? "Unknown error"}`,
          variant: "destructive",
        });
      }

      // 2) load branches + users (users will auto-filter by activeBranchId)
      await Promise.all([fetchBranches(), fetchUsers()]);
      setLoading(false);
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const fetchBranches = async () => {
    if (!companyId) {
      setBranches([]);
      return;
    }

    const { data, error } = await supabase
      .from("branches")
      .select("id, name, is_active, company_id")
      .eq("company_id", companyId as any)
      .order("name");

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setBranches([]);
      return;
    }

    setBranches((data ?? []) as Branch[]);
  };

  const fetchUsers = async () => {
    if (!companyId) {
      setUsers([]);
      return;
    }

    const baseSelect = `
      id,
      user_id,
      full_name,
      phone,
      role,
      branch_id,
      staff_code,
      avatar_url,
      is_attendance_manager,
      is_returns_handler,
      created_at,
      updated_at,
      company_id,
      deleted_at,
      deleted_by,
      deleted_reason,
      branch:branches(name)
    `;

    try {
      let q = supabase
        .from("profiles")
        .select(baseSelect)
        .eq("company_id", companyId as any)
        .order("full_name");

      // ✅ Branch filter:
      // activeBranchId = null => All branches (no extra filter)
      if (activeBranchId) {
        q = q.eq("branch_id", String(activeBranchId) as any);
      }

      if (!showDeleted) {
        q = q.filter("deleted_at", "is", null as any);
      }

      const { data, error } = await q;
      if (error) throw error;

      setUsers((data ?? []) as UserRow[]);
    } catch (e: any) {
      toast({
        title: "Error",
        description: String(e?.message ?? "Failed to load employees"),
        variant: "destructive",
      });
      setUsers([]);
    }
  };

  const openEditDialog = (user: UserRow) => {
    setSelectedUser(user);
    setEditRole((user.role as AppRole) ?? "");
    setEditBranchId((user.branch_id as any) ?? "");
    setEditDialogOpen(true);
  };

  const saveRoleAndBranch = async () => {
    if (!selectedUser) return;

    // Prevent admin from removing own admin role
    const isEditingSelf =
      (me as any)?.user_id && selectedUser.user_id === (me as any).user_id;

    if (isEditingSelf && (me as any)?.role === "admin" && editRole !== "admin") {
      toast({
        title: "Blocked",
        description: "You cannot remove your own admin role.",
        variant: "destructive",
      });
      return;
    }

    if (!editRole || !editBranchId) {
      toast({
        title: "Missing info",
        description: "Please select role and branch.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await updateEmployeeRoleBranch(
      String(selectedUser.user_id),
      editRole as any,
      String(editBranchId)
    );

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Updated", description: "Role/Branch updated successfully." });
    setEditDialogOpen(false);
    setSelectedUser(null);
    await fetchUsers();
  };

  const togglePermission = async (
    userId: string,
    field: "is_attendance_manager" | "is_returns_handler",
    currentValue: boolean
  ) => {
    const { error } = await setEmployeeFlag(String(userId), field, !currentValue);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Permission Updated" });
      void safeRefreshUsers();
    }
  };

  const handleAddEmployee = async () => {
    if (addInFlightRef.current) return;
    addInFlightRef.current = true;

    try {
      if (!newEmployee.email || !newEmployee.password || !newEmployee.fullName) {
        toast({
          title: "Error",
          description: "Please fill in Full Name, Email and Password",
          variant: "destructive",
        });
        return;
      }

      if (newEmployee.password.length < 6) {
        toast({
          title: "Error",
          description: "Password must be at least 6 characters",
          variant: "destructive",
        });
        return;
      }

      if (!newEmployee.role) {
        toast({
          title: "Error",
          description: "Please assign a role (admin/cashier/warehouse/staff).",
          variant: "destructive",
        });
        return;
      }

      if (!newEmployee.branchId) {
        toast({
          title: "Error",
          description: "Please assign a branch.",
          variant: "destructive",
        });
        return;
      }

      setCreating(true);

      const { error, userId } = await createEmployee(
        newEmployee.email.trim(),
        newEmployee.password,
        newEmployee.fullName.trim(),
        {
          phone: newEmployee.phone?.trim() || null,
          role: newEmployee.role as AppRole,
          branchId: newEmployee.branchId as string,
        }
      );

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (!userId) {
        toast({
          title: "Error",
          description: "Employee created but no user id returned",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Employee Added",
        description: `${newEmployee.fullName} has been registered.`,
      });

      setAddEmployeeOpen(false);
      setNewEmployee({
        email: "",
        password: "",
        fullName: "",
        phone: "",
        role: "",
        branchId: "",
      });

      await fetchUsers();
    } finally {
      setCreating(false);
      addInFlightRef.current = false;
    }
  };

  const openDeleteDialog = (u: UserRow) => {
    setDeleteTarget(u);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteEmployee = async () => {
    if (!deleteTarget) return;

    // block deleting self
    const isSelf = (me as any)?.user_id && deleteTarget.user_id === (me as any).user_id;
    if (isSelf) {
      toast({
        title: "Blocked",
        description: "You cannot delete your own account.",
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    try {
      const { error } = await deleteEmployee(String(deleteTarget.user_id), {
        mode: "soft",
        reason: "Deleted by admin",
      });

      if (error) throw error;

      toast({
        title: "Deleted",
        description: `${deleteTarget.full_name} removed successfully.`,
      });

      setDeleteDialogOpen(false);
      setDeleteTarget(null);

      await fetchUsers();
    } catch (e: any) {
      const msg = String(e?.message ?? "Failed to delete employee");
      toast({
        title: "Error",
        description:
          msg +
          (msg.toLowerCase().includes("authorization") || msg.toLowerCase().includes("jwt")
            ? " (Logout, clear site data, restart dev server, then login again.)"
            : ""),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const getRoleColor = (role: AppRole) => {
    switch (role) {
      case "admin":
        return "bg-red-500";
      case "cashier":
        return "bg-blue-500";
      case "warehouse":
        return "bg-orange-500";
      case "staff":
        return "bg-slate-500";
      default:
        return "bg-slate-500";
    }
  };

  const renderBranchName = (u: UserRow) => {
    if (u.branch?.name) return u.branch.name;
    if (u.branch_id && branchesById.get(String(u.branch_id))?.name) {
      return branchesById.get(String(u.branch_id))!.name;
    }
    return u.branch_id ? "Assigned (name unavailable)" : "Not assigned";
  };

  const tableEmptyText = useMemo(() => {
    if (loading) return "Loading...";
    if (!companyId) return "No company found. Complete setup first.";
    return "No employees found";
  }, [loading, companyId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Employee Management</h1>
          <p className="text-slate-400">
            Assign roles & branches (secure via Edge Functions)
          </p>
          <p className="text-slate-500 text-sm">
            Viewing: <span className="text-slate-200 font-semibold">{activeBranchName}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={showDeleted} onCheckedChange={setShowDeleted} />
            <span className="text-sm text-slate-300">Show deleted</span>
          </div>

          <Button onClick={() => setAddEmployeeOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Employee
          </Button>
        </div>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <UsersIcon className="h-5 w-5" />
            Employees
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Name</TableHead>
                <TableHead className="text-slate-400">Phone</TableHead>
                <TableHead className="text-slate-400">Branch</TableHead>
                <TableHead className="text-slate-400">Role</TableHead>
                <TableHead className="text-slate-400">Permissions</TableHead>
                <TableHead className="text-slate-400">Joined</TableHead>
                <TableHead className="text-slate-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {users.map((user) => (
                <TableRow key={String(user.id)} className="border-slate-700">
                  <TableCell className="text-white font-medium">{user.full_name}</TableCell>

                  <TableCell className="text-slate-300">{user.phone || "-"}</TableCell>

                  <TableCell className="text-slate-300">{renderBranchName(user)}</TableCell>

                  <TableCell>
                    {user.role ? (
                      <Badge className={`${getRoleColor(user.role as AppRole)} capitalize`}>
                        {user.role}
                      </Badge>
                    ) : (
                      <span className="text-slate-500 text-sm">No role</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Boolean(user.is_attendance_manager)}
                          onCheckedChange={() =>
                            togglePermission(
                              String(user.user_id),
                              "is_attendance_manager",
                              Boolean(user.is_attendance_manager)
                            )
                          }
                        />
                        <span className="text-xs text-slate-400">Attendance Manager</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Boolean(user.is_returns_handler)}
                          onCheckedChange={() =>
                            togglePermission(
                              String(user.user_id),
                              "is_returns_handler",
                              Boolean(user.is_returns_handler)
                            )
                          }
                        />
                        <span className="text-xs text-slate-400">Returns Handler</span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-slate-300">
                    {user.created_at ? new Date(String(user.created_at)).toLocaleDateString() : "-"}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(user)}>
                        <Shield className="h-4 w-4 mr-2" />
                        Edit Role/Branch
                      </Button>

                      <Button size="sm" variant="destructive" onClick={() => openDeleteDialog(user)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                    {tableEmptyText}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Role/Branch Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">
              Edit Role & Branch — {selectedUser?.full_name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-200">Branch</Label>
              <Select value={editBranchId} onValueChange={(v) => setEditBranchId(v)}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches
                    .filter((b) => b.is_active)
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveRoleAndBranch} disabled={!editRole || !editBranchId}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Employee Dialog */}
      <Dialog open={addEmployeeOpen} onOpenChange={setAddEmployeeOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Add New Employee</DialogTitle>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto pr-2 space-y-4">
            <div>
              <Label className="text-slate-200">Full Name *</Label>
              <Input
                value={newEmployee.fullName}
                onChange={(e) => setNewEmployee({ ...newEmployee, fullName: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-200">Email *</Label>
              <Input
                type="email"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-200">Password *</Label>
              <Input
                type="password"
                value={newEmployee.password}
                onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-200">Phone Number</Label>
              <Input
                value={newEmployee.phone}
                onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-200">Assign Role *</Label>
              <Select
                value={newEmployee.role}
                onValueChange={(v) => setNewEmployee({ ...newEmployee, role: v as AppRole })}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-200">Assign Branch *</Label>
              <Select
                value={newEmployee.branchId}
                onValueChange={(v) => setNewEmployee({ ...newEmployee, branchId: v })}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches
                    .filter((b) => b.is_active)
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-slate-700">
            <Button variant="outline" onClick={() => setAddEmployeeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddEmployee} disabled={creating}>
              {creating ? "Creating..." : "Add Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Employee Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Employee</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-slate-200">
              Are you sure you want to delete{" "}
              <span className="font-semibold">{deleteTarget?.full_name}</span>?
            </p>
            <p className="text-sm text-slate-400">
              This will remove the employee using the secure Edge Function.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteTarget(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteEmployee} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
