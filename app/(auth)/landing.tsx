import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { app, white } from '@/constants/colors';

export default function LandingScreen() {
  const router = useRouter();

  return (
    <LinearGradient
      colors={[...app.backgroundGradient]}
      style={styles.container}
    >
      <View style={styles.content}>
        <LinearGradient
          colors={[...app.iconGradient]}
          style={styles.iconWrapper}
        >
          <View style={styles.iconInner}>
            <Ionicons name="mic" size={40} color={app.iconOnLight} />
          </View>
        </LinearGradient>

        <Text style={styles.title}>Lingua AI</Text>
        <Text style={styles.tagline}>
          Master any language through conversation
        </Text>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.push('/(auth)/setup')}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>Powered by AI conversation</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 48,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrapper: {
    width: 88,
    height: 88,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: app.textPrimary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 16,
    color: app.textPrimary,
    textAlign: 'center',
    marginBottom: 40,
    opacity: 0.95,
    lineHeight: 22,
  },
  button: {
    backgroundColor: app.buttonPrimary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    minWidth: 200,
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
  footer: {
    fontSize: 13,
    color: app.textMuted,
    textAlign: 'center',
  },
});
