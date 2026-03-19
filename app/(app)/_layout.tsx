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
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
