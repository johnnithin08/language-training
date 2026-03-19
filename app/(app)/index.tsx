import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { app, white, colors } from '@/constants/colors';

type SessionItem = {
  id: string;
  title: string;
  meta: string;
  score: string;
  scoreColor: string;
  emoji: string;
};

const RECENT_SESSIONS: SessionItem[] = [
  {
    id: '1',
    title: 'Restaurant Ordering',
    meta: 'Yesterday • 8 min',
    score: '7.2',
    scoreColor: '#2dd4bf',
    emoji: '🍽️',
  },
  {
    id: '2',
    title: 'Introductions',
    meta: '2 days ago • 5 min',
    score: '6.5',
    scoreColor: app.buttonPrimary,
    emoji: '👋',
  },
  {
    id: '3',
    title: 'Directions Practice',
    meta: '3 days ago • 7 min',
    score: '7.8',
    scoreColor: '#2dd4bf',
    emoji: '🧭',
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState('there');

  useEffect(() => {
    let active = true;
    const loadName = async () => {
      try {
        const attributes = await fetchUserAttributes();
        const profileName = attributes.name?.trim();
        if (active && profileName) {
          setName(profileName);
        }
      } catch {
        // keep fallback greeting
      }
    };
    void loadName();
    return () => {
      active = false;
    };
  }, []);

  const greeting = useMemo(() => `Welcome back ${name}`, [name]);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left + 24,
          paddingRight: insets.right + 24,
        },
      ]}
    >
      <Text style={styles.welcome}>{greeting}</Text>
      <Text style={styles.title}>Ready to practice?</Text>

      <Text style={styles.sectionLabel}>NEW CONVERSATION</Text>
      <Pressable
        style={({ pressed }) => [styles.newConversationCard, pressed && styles.cardPressed]}
        onPress={() => router.push('/(app)/conversations')}
      >
        <LinearGradient colors={[...app.iconGradient]} style={styles.newConversationIconWrap}>
          <View style={styles.newConversationIconInner}>
            <Ionicons name="mic" size={24} color={app.iconOnLight} />
          </View>
        </LinearGradient>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>New Conversation</Text>
          <Text style={styles.cardMeta}>English practice • Choose a topic</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>RECENT SESSIONS</Text>
      <View style={styles.listWrap}>
        {RECENT_SESSIONS.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.iconWrap}>
              <Text style={styles.iconText}>{item.emoji}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{item.meta}</Text>
            </View>
            <View style={styles.scoreWrap}>
              <Text style={[styles.scoreValue, { color: item.scoreColor }]}>
                {item.score}
              </Text>
              <Text style={styles.scoreLabel}>Score</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate[900],
  },
  welcome: {
    fontSize: 18,
    color: app.textMuted,
    marginBottom: 4,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: white,
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: app.textMuted,
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  listWrap: {
    gap: 14,
  },
  card: {
    backgroundColor: '#111934',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2a3561',
    paddingHorizontal: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  newConversationCard: {
    backgroundColor: '#111934',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2a3561',
    paddingHorizontal: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  newConversationIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  newConversationIconInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPressed: {
    opacity: 0.9,
  },
  chevron: {
    color: app.textMuted,
    fontSize: 28,
    lineHeight: 28,
    marginLeft: 8,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#17454f',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconText: {
    fontSize: 20,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    color: white,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardMeta: {
    color: app.textMuted,
    fontSize: 14,
  },
  scoreWrap: {
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 2,
  },
  scoreLabel: {
    color: app.textMuted,
    fontSize: 14,
  },
});
