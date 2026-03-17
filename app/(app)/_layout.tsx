import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { app, colors } from '@/constants/colors';

export default function AppLayout() {
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
