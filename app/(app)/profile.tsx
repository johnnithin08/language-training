import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/auth';
import { app, white, colors } from '@/constants/colors';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = () => {
    signOut();
    router.replace('/(auth)/landing');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>Manage your account and preferences.</Text>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handleSignOut}
      >
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate[900],
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: white,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: app.textMuted,
    marginBottom: 32,
  },
  button: {
    backgroundColor: colors.red[600],
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: white,
    fontSize: 17,
    fontWeight: '700',
  },
});
