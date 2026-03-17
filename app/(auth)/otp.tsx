import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { app, white, colors } from '@/constants/colors';

export default function OtpScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify OTP</Text>
      <Text style={styles.subtitle}>Enter the code sent to your phone or email</Text>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => router.push('/(auth)/login')}
      >
        <Text style={styles.buttonText}>Verify</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate[900],
    padding: 24,
    justifyContent: 'center',
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
    backgroundColor: app.buttonPrimary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
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
