import { Tabs } from 'expo-router';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { app, colors } from '@/constants/colors';
import { useAuth } from '@/contexts/auth';

export default function AppLayout() {
  const { userData } = useAuth();

  if (!userData?.onboardingCompleted) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: app.buttonPrimary,
        tabBarInactiveTintColor: colors.slate[400],
        tabBarStyle: { backgroundColor: colors.slate[900] },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="listening"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="voice-practice"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="session-analysis"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
