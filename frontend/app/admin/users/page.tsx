"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  company_id: string | null;
  company_name: string | null;
  company_status: string | null;
  company_website: string | null;
  created_at: string | null;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, hydrate, initialized } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    if (initialized && (!user || user.role !== "admin")) {
      router.push("/login");
    }
  }, [initialized, user, router]);

  useEffect(() => {
    if (user?.role === "admin") {
      authApi.adminUsers()
        .then((r) => setUsers(r.data.users || []))
        .finally(() => setLoading(false));
    }
  }, [user]);

  async function toggleActive(u: UserRow) {
    setTogglingId(u.id);
    try {
      await authApi.adminUpdateUser(u.id, { is_active: !u.is_active });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: !x.is_active } : x)));
    } finally {
      setTogglingId(null);
    }
  }

  async function toggleRole(u: UserRow) {
    const newRole = u.role === "admin" ? "user" : "admin";
    setTogglingId(u.id);
    try {
      await authApi.adminUpdateUser(u.id, { role: newRole });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: newRole } : x)));
    } finally {
      setTogglingId(null);
    }
  }

  const activeUsers = users.filter((u) => u.is_active).length;
  const adminUsers = users.filter((u) => u.role === "admin").length;
  const usersWithCompanies = users.filter((u) => u.company_id).length;
  const recentSignups = users.filter((u) => {
    if (!u.created_at) return false;
    const d = new Date(u.created_at);
    const now = new Date();
    return (now.getTime() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
  }).length;

  if (!initialized || !user || user.role !== "admin") {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Arche Studios</p>
            <p className="text-xs text-gray-400">User Management</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/admin")}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
          >
            Portfolio
          </button>
          <span className="text-xs text-gray-300">|</span>
          <span className="text-sm text-gray-500">{user.email}</span>
          <button
            onClick={() => { useAuth.getState().logout(); router.push("/login"); }}
            className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="px-8 py-6 max-w-7xl">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Users", value: users.length, sub: "registered accounts" },
            { label: "Active Users", value: activeUsers, sub: `${users.length - activeUsers} inactive` },
            { label: "Admins", value: adminUsers, sub: `${users.length - adminUsers} regular users` },
            { label: "This Week", value: recentSignups, sub: "new signups (7d)" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
              <p className="text-3xl font-bold text-gray-900">{kpi.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">All Users</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{users.length} users</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">
                {activeUsers} active
              </span>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading users...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Company</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-800">{u.full_name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      {u.company_name ? (
                        <div>
                          <button
                            onClick={() => u.company_id && router.push(`/dashboard/${u.company_id}`)}
                            className="text-blue-600 hover:underline text-sm font-medium"
                          >
                            {u.company_name}
                          </button>
                          <p className="text-xs text-gray-400">
                            {u.company_website?.replace(/^https?:\/\//, "")}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No company</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
                        u.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600"
                      )}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        u.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                      )}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "N/A"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleRole(u)}
                          disabled={togglingId === u.id || u.id === user.id}
                          className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                          title={u.role === "admin" ? "Demote to user" : "Promote to admin"}
                        >
                          {u.role === "admin" ? "Demote" : "Promote"}
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={togglingId === u.id || u.id === user.id}
                          className={cn(
                            "text-xs px-2 py-1 rounded border transition-colors disabled:opacity-40",
                            u.is_active
                              ? "border-red-200 text-red-600 hover:bg-red-50"
                              : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                          )}
                        >
                          {u.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
