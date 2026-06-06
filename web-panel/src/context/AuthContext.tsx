import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../utils/api';

type User = {
  id: string;
  name: string;
  role: string;
  email?: string;
  store_id?: string | null;
  cluster_store_ids?: string[] | null;
};

// Multi-store: HQ super-admin (legacy 'admin' alias) and the staff roles allowed
// into the web panel.
const HQ_ROLES = ['admin', 'super_admin'];
const STAFF_ROLES = ['kitchen', 'cashier', 'store_manager', 'area_manager'];
type AuthCtx = {
  user: User | null;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  loginPin: (pin: string) => Promise<void>;
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

  const loginEmail = async (email: string, password: string) => {
    const res = await api('/auth/login', { method: 'POST', body: { email, password } });
    if (!HQ_ROLES.includes(res.user.role)) throw new Error('Access denied. HQ only.');
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    setUser(res.user);
  };

  const loginPin = async (pin: string) => {
    const res = await api('/auth/pin-login', { method: 'POST', body: { pin } });
    if (!STAFF_ROLES.includes(res.user.role)) throw new Error('Invalid staff role');
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
    <AuthContext.Provider value={{ user, loading, loginEmail, loginPin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
