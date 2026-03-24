import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { app, colors, white } from '@/constants/colors';
import { CONVERSATION_CATEGORIES } from '@/constants/conversationCategoryConfig';
import { getUserConfig, type UserConfig } from '@/services/user-config';

const CATEGORIES = CONVERSATION_CATEGORIES.map(({ id, title, emoji }) => ({
  id,
  title,
  emoji,
}));

export default function ConversationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [userConfig, setUserConfig] = useState<UserConfig | null>(null);

  useEffect(() => {
    void getUserConfig().then((cfg) => setUserConfig(cfg));
  }, []);

  const handleStartSession = () => {
    if (!selectedCategoryId) return;

    if (userConfig?.voiceToVoiceEnabled) {
      router.push({
        pathname: '/(app)/voice-practice',
        params: { categoryId: selectedCategoryId, voiceId: userConfig.voiceId },
      });
    } else {
      router.push({
        pathname: '/(app)/listening',
        params: { categoryId: selectedCategoryId },
      });
    }
  };

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
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={white} />
        </Pressable>
        <Text style={styles.headerTitle}>CHOOSE CATEGORY</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.title}>Pick a conversation topic</Text>
      <Text style={styles.subtitle}>What would you like to practice?</Text>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {CATEGORIES.map((category) => (
          <Pressable
            key={category.id}
            style={({ pressed }) => [
              styles.categoryChip,
              selectedCategoryId === category.id && styles.categoryChipSelected,
              pressed && styles.cardPressed,
            ]}
            onPress={() => setSelectedCategoryId(category.id)}
          >
            <Text style={styles.categoryText}>{`${category.emoji} ${category.title}`}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.startButton,
          pressed && styles.startButtonPressed,
          !selectedCategoryId && styles.startButtonDisabled,
        ]}
        onPress={handleStartSession}
        disabled={!selectedCategoryId}
      >
        <Text style={styles.startButtonText}>Start Session</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate[900],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.slate[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: app.buttonPrimary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  title: {
    color: white,
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: app.textMuted,
    fontSize: 16,
    marginBottom: 24,
  },
  list: {
    gap: 12,
    paddingBottom: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryChip: {
    backgroundColor: '#111934',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2a3561',
    minHeight: 56,
    width: '48%',
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryChipSelected: {
    backgroundColor: '#2a2268',
    borderColor: app.buttonPrimary,
  },
  categoryText: {
    color: white,
    fontSize: 17,
    fontWeight: '600',
  },
  cardPressed: {
    opacity: 0.9,
  },
  startButton: {
    backgroundColor: app.buttonPrimary,
    borderRadius: 20,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  startButtonPressed: {
    opacity: 0.9,
  },
  startButtonDisabled: {
    opacity: 0.45,
  },
  startButtonText: {
    color: white,
    fontSize: 18,
    fontWeight: '700',
  },
});
