import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signUp } from 'aws-amplify/auth';
import { app, white, colors } from '@/constants/colors';

function getAuthErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name: string }).name;
    const message = (err as { message?: string }).message ?? '';
    if (name === 'UsernameExistsException' || message.includes('already exists'))
      return 'An account with this email already exists. Sign in instead.';
    if (name === 'InvalidPasswordException' || message.includes('password'))
      return 'Password must be at least 8 characters with upper, lower, number, and symbol.';
    if (name === 'InvalidParameterException')
      return 'Please check your name and email.';
  }
  return 'Something went wrong. Please try again.';
}

export default function SetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    setError('');
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp({
        username: trimmedEmail,
        password,
        options: {
          userAttributes: {
            email: trimmedEmail,
            name: trimmedName,
          },
        },
      });
      router.push({
        pathname: '/(auth)/otp',
        params: { email: trimmedEmail },
      });
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: 24 + insets.top,
            paddingBottom: 24 + insets.bottom,
            paddingLeft: 24 + insets.left,
            paddingRight: 24 + insets.right,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Create Your Account</Text>
        <Text style={styles.subtitle}>
          Start learning languages with AI today
        </Text>

        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          placeholder="John Doe"
          placeholderTextColor={colors.slate[400]}
          value={fullName}
          onChangeText={(t) => { setFullName(t); setError(''); }}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.slate[400]}
          value={email}
          onChangeText={(t) => { setEmail(t); setError(''); }}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.slate[400]}
          value={password}
          onChangeText={(t) => { setPassword(t); setError(''); }}
          secureTextEntry
        />

        <Text style={styles.label}>Confirm Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.slate[400]}
          value={confirmPassword}
          onChangeText={(t) => { setConfirmPassword(t); setError(''); }}
          secureTextEntry
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
          onPress={handleSendOtp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={white} />
          ) : (
            <Text style={styles.buttonText}>Send OTP</Text>
          )}
        </Pressable>

        <Text style={styles.helper}>
          We'll send a verification code to your email
        </Text>

        <Pressable
          onPress={() => router.push('/(auth)/login')}
          style={styles.ctaLink}
          hitSlop={8}
        >
          <Text style={styles.ctaText}>
            Already have an account? <Text style={styles.ctaHighlight}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate[900],
  },
  scrollContent: {
    paddingBottom: 24,
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
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: white,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.slate[800],
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: white,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    color: colors.red[400],
    marginBottom: 16,
  },
  button: {
    backgroundColor: app.buttonPrimary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: white,
    fontSize: 17,
    fontWeight: '700',
  },
  helper: {
    fontSize: 14,
    color: app.textMuted,
    textAlign: 'center',
    marginTop: 16,
  },
  ctaLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 15,
    color: app.textMuted,
  },
  ctaHighlight: {
    color: app.buttonPrimary,
    fontWeight: '600',
  },
});
