import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { getCurrentUser, signOut as amplifySignOut } from 'aws-amplify/auth';

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      try {
        await getCurrentUser();
        if (!cancelled) setIsAuthenticated(true);
      } catch {
        if (!cancelled) setIsAuthenticated(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await amplifySignOut();
    } catch (_) {
      // ignore
    }
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
