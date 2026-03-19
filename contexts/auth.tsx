import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchUserAttributes,
  getCurrentUser,
  signOut as amplifySignOut,
} from 'aws-amplify/auth';
import { upsertUserProfile } from '@/services/user-model';

export type UserData = {
  userId: string;
  userRecordId?: string;
  onboardingCompleted: boolean;
  targetLanguage?: string;
  currentLevel?: string;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  userData: UserData | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setUserData: (updates: Partial<UserData>) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const USER_DATA_STORAGE_PREFIX = '@language-training/user-data:';

function defaultUserData(userId: string): UserData {
  return {
    userId,
    onboardingCompleted: false,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserDataState] = useState<UserData | null>(null);

  const loadUserData = useCallback(async (userId: string): Promise<UserData> => {
    const key = `${USER_DATA_STORAGE_PREFIX}${userId}`;
    try {
      const stored = await AsyncStorage.getItem(key);
      if (!stored) {
        const initial = defaultUserData(userId);
        await AsyncStorage.setItem(key, JSON.stringify(initial));
        return initial;
      }
      const parsed = JSON.parse(stored) as Partial<UserData>;
      const merged: UserData = {
        ...defaultUserData(userId),
        ...parsed,
        userId,
      };
      await AsyncStorage.setItem(key, JSON.stringify(merged));
      return merged;
    } catch {
      return defaultUserData(userId);
    }
  }, []);

  const persistUserData = useCallback(async (next: UserData) => {
    const key = `${USER_DATA_STORAGE_PREFIX}${next.userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(next));
  }, []);

  const syncUserDataWithCloud = useCallback(
    async (current: UserData): Promise<UserData> => {
      try {
        const attributes = await fetchUserAttributes();
        const email = attributes.email;
        if (!email) return current;

        const name = attributes.name || 'User';
        const cloud = await upsertUserProfile(current.userRecordId, {
          name,
          email,
          onboardingCompleted: current.onboardingCompleted,
          targetLanguage: current.targetLanguage,
          currentLevel: current.currentLevel,
        });

        const merged: UserData = {
          ...current,
          userRecordId: cloud.id,
          onboardingCompleted: cloud.onboardingCompleted,
          targetLanguage: cloud.targetLanguage ?? current.targetLanguage,
          currentLevel: cloud.currentLevel ?? current.currentLevel,
        };

        await persistUserData(merged);
        return merged;
      } catch {
        return current;
      }
    },
    [persistUserData]
  );

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      try {
        const currentUser = await getCurrentUser();
        const id = currentUser.userId || currentUser.username;
        const loaded = await loadUserData(id);
        const merged = await syncUserDataWithCloud(loaded);
        if (!cancelled) {
          setIsAuthenticated(true);
          setUserDataState(merged);
        }
      } catch {
        if (!cancelled) {
          setIsAuthenticated(false);
          setUserDataState(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    checkAuth();
    return () => {
      cancelled = true;
    };
  }, [loadUserData, syncUserDataWithCloud]);

  const signIn = useCallback(async () => {
    const currentUser = await getCurrentUser();
    const id = currentUser.userId || currentUser.username;
    const loaded = await loadUserData(id);
    const merged = await syncUserDataWithCloud(loaded);
    setUserDataState(merged);
    setIsAuthenticated(true);
  }, [loadUserData, syncUserDataWithCloud]);

  const setUserData = useCallback(
    async (updates: Partial<UserData>) => {
      let nextData: UserData | null = null;
      setUserDataState((previous) => {
        if (!previous) return previous;
        const next: UserData = { ...previous, ...updates, userId: previous.userId };
        nextData = next;
        return next;
      });
      if (nextData) {
        await persistUserData(nextData);
        const synced = await syncUserDataWithCloud(nextData);
        setUserDataState(synced);
      }
    },
    [persistUserData, syncUserDataWithCloud]
  );

  const signOut = useCallback(async () => {
    try {
      await amplifySignOut();
    } catch (_) {
      // ignore
    }
    setIsAuthenticated(false);
    setUserDataState(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, userData, signIn, signOut, setUserData }}
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
