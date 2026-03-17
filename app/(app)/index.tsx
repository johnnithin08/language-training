import { View, Text, StyleSheet } from 'react-native';
import { app, white, colors } from '@/constants/colors';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home</Text>
      <Text style={styles.subtitle}>Start a conversation to practice your language.</Text>
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
  },
});
