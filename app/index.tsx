import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/auth';
import { colors } from '@/constants/colors';

export default function Index() {
  const { isAuthenticated, isLoading, userData } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.purple[400]} />
      </View>
    );
  }
  if (isAuthenticated) {
    if (!userData?.onboardingCompleted) {
      return <Redirect href="/onboarding" />;
    }
    return <Redirect href="/(app)" />;
  }
  return <Redirect href="/(auth)/landing" />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.slate[900],
    justifyContent: 'center',
    alignItems: 'center',
  },
});
