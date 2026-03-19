import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { app, colors, white } from '@/constants/colors';

export default function ListeningScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 16,
          paddingLeft: insets.left + 20,
          paddingRight: insets.right + 20,
        },
      ]}
    >
      <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="close" size={24} color={white} />
      </Pressable>

      <View style={styles.content}>
        <LinearGradient colors={[...app.iconGradient]} style={styles.micGradient}>
          <Ionicons name="mic-outline" size={54} color={white} />
        </LinearGradient>

        <Text style={styles.title}>Listening...</Text>
        <Text style={styles.subtitle}>Tell the AI something</Text>
        <Text style={styles.helper}>Speak naturally - No pressure</Text>

        <View style={styles.waveWrap}>
          <View style={[styles.waveBar, { height: 18 }]} />
          <View style={[styles.waveBar, { height: 26 }]} />
          <View style={[styles.waveBar, { height: 14 }]} />
          <View style={[styles.waveBar, { height: 34 }]} />
          <View style={[styles.waveBar, { height: 22 }]} />
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.skipButton, pressed && styles.skipButtonPressed]}
        onPress={() => router.replace('/(app)')}
      >
        <Text style={styles.skipButtonText}>End Session</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate[950],
  },
  closeButton: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.slate[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micGradient: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    color: white,
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: white,
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 6,
  },
  helper: {
    color: app.textMuted,
    fontSize: 16,
    marginBottom: 28,
  },
  waveWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  waveBar: {
    width: 8,
    borderRadius: 8,
    backgroundColor: app.buttonPrimary,
  },
  skipButton: {
    backgroundColor: app.buttonPrimary,
    borderRadius: 20,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonPressed: {
    opacity: 0.9,
  },
  skipButtonText: {
    color: white,
    fontSize: 18,
    fontWeight: '700',
  },
});
