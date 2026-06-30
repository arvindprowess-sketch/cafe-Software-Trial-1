import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../utils/api';

type User = {
  id: string;
  name: string;
  role: string;
  email?: string;
  login_code?: string | null;
  store_id?: string | null;
  cluster_store_ids?: string[] | null;
};

// Multi-store: HQ super-admin (legacy 'admin' alias) and the staff roles allowed
// into the web panel. Auth V2: everyone signs in here with code + password
// (customers are blocked server-side with a 403).
const HQ_ROLES = ['admin', 'super_admin'];
const STAFF_ROLES = ['kitchen', 'cashier', 'store_manager', 'area_manager'];
const PORTAL_ROLES = [...HQ_ROLES, ...STAFF_ROLES];
type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (code: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (stored && token) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  // Auth V2: single code+password login (staff + HQ). The login code OR an email
  // is accepted as the `code`.
  const login = async (code: string, password: string) => {
    const res = await api('/auth/login', { method: 'POST', body: { code, password } });
    if (!PORTAL_ROLES.includes(res.user.role)) throw new Error('Access denied. This account cannot use the panel.');
    // Token kept in localStorage for now; cookie/CSP hardening (H-5) is Phase 9.
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
