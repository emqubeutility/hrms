import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  login as apiLogin,
  logout as apiLogout,
  getAccessToken,
  setAccessToken,
  setRefreshToken,
  clearTokens,
} from './api';
import { getMe } from './admin-api';

export interface AuthUser {
  id: number;
  username: string;
  /** The person's name from their profile (first and last), for display. Falls back to the username. */
  fullName: string;
  userTypeId: number;
  profileId: number;
  mustChangePassword: boolean;
  /** The employee record this account is linked to, for "My profile". null for accounts with none (e.g. a System Admin with no employee record). */
  employeeId: number | null;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  /** Resolves to true when the user must change their password before continuing. */
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    const me = await getMe();
    setUser({
      id: me.data.id,
      username: me.data.username,
      fullName: [me.data.profile?.name, me.data.profile?.lastName].filter(Boolean).join(' ') || me.data.username,
      userTypeId: me.data.userTypeId,
      profileId: me.data.profileId,
      mustChangePassword: me.data.mustChangePassword,
      employeeId: me.data.profile?.employee?.id ?? null,
    });
  };

  useEffect(() => {
    if (!getAccessToken()) {
      setIsLoading(false);
      return;
    }
    // A stored token alone does not say who the user is, so ask the API.
    refreshUser()
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const response = await apiLogin(username, password);
    const { accessToken, refreshToken, mustChangePassword } = response.data;
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
    // Fetch the full account (not just the login response) so employeeId is there from the first page too.
    await refreshUser();
    return mustChangePassword;
  };

  const logout = async () => {
    await apiLogout();
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!user,
        isLoading,
        user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
