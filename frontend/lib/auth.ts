import { create } from "zustand";
import { authApi } from "@/lib/api";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  company_id: string | null;
  created_at: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  initialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, companyId?: string) => Promise<void>;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,
  initialized: false,

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await authApi.login({ email, password });
      const { token, user } = res.data;
      localStorage.setItem("arche_token", token);
      set({ token, user, loading: false });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  register: async (email, password, fullName, companyId) => {
    set({ loading: true });
    try {
      const res = await authApi.register({ email, password, full_name: fullName, company_id: companyId });
      const { token, user } = res.data;
      localStorage.setItem("arche_token", token);
      set({ token, user, loading: false });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  logout: () => {
    localStorage.removeItem("arche_token");
    set({ user: null, token: null });
  },

  hydrate: async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("arche_token") : null;
    if (!token) {
      set({ initialized: true });
      return;
    }
    try {
      set({ token, loading: true });
      const res = await authApi.me();
      set({ user: res.data, loading: false, initialized: true });
    } catch {
      localStorage.removeItem("arche_token");
      set({ user: null, token: null, loading: false, initialized: true });
    }
  },
}));
