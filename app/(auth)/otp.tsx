import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';
import { app, white, colors } from '@/constants/colors';

const OTP_LENGTH = 6;
const ACCENT_GREEN = colors.emerald[400];

function getAuthErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: string }).message ?? '';
    if (message.includes('CodeMismatch') || message.includes('Invalid verification code'))
      return 'Invalid or expired code. Please try again or resend.';
    if (message.includes('Expired') || message.includes('expired'))
      return 'Code expired. Please request a new one.';
  }
  return 'Something went wrong. Please try again.';
}

export default function OtpScreen() {
  const router = useRouter();
  const { email: paramEmail } = useLocalSearchParams<{ email?: string }>();
  const insets = useSafeAreaInsets();
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const email = paramEmail ?? '';

  const handleOtpChange = (value: string, index: number) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setError('');
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    if (!email) {
      setError('Email is missing. Please go back and sign up again.');
      return;
    }
    const code = otp.join('');
    if (code.length !== OTP_LENGTH) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await confirmSignUp({
        username: email,
        confirmationCode: code,
      });
      router.replace('/(auth)/login');
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!email) return;
    setError('');
    setResendLoading(true);
    try {
      await resendSignUpCode({ username: email });
      setOtp(Array(OTP_LENGTH).fill(''));
      setError('');
      // Optional: show success toast
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 24,
            paddingBottom: 24 + insets.bottom,
            paddingLeft: 24 + insets.left,
            paddingRight: 24 + insets.right,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={24} color={white} />
          </Pressable>
          <Text style={styles.headerTitle}>VERIFY</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.iconCircle}>
          <Ionicons name="mail-open" size={48} color={white} />
        </View>

        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{' '}
          <Text style={styles.emailHighlight}>{email || 'your email'}</Text>
        </Text>

        <Text style={styles.otpLabel}>Enter OTP Code</Text>
        <View style={styles.otpRow}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              style={styles.otpBox}
              value={digit}
              onChangeText={(v) => handleOtpChange(v, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              editable={!loading}
            />
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Text style={styles.resendPrompt}>Didn't receive the code?</Text>
        <Pressable
          onPress={handleResendOtp}
          hitSlop={8}
          disabled={resendLoading}
        >
          <Text style={[styles.resendLink, resendLoading && styles.resendLinkDisabled]}>
            {resendLoading ? 'Sending…' : 'Resend OTP'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={white} />
          ) : (
            <Text style={styles.buttonText}>Verify & Continue</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.slate[900],
  },
  scrollContent: {
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ACCENT_GREEN,
    letterSpacing: 1,
  },
  headerSpacer: {
    width: 32,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.teal[500],
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: white,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: app.textMuted,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  emailHighlight: {
    color: ACCENT_GREEN,
    fontWeight: '600',
  },
  otpLabel: {
    fontSize: 14,
    color: colors.slate[400],
    marginBottom: 12,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  otpBox: {
    flex: 1,
    backgroundColor: colors.slate[800],
    borderRadius: 12,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: '600',
    color: white,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.red[400],
    marginBottom: 16,
    textAlign: 'center',
  },
  resendPrompt: {
    fontSize: 14,
    color: colors.slate[400],
    marginBottom: 4,
  },
  resendLink: {
    fontSize: 16,
    fontWeight: '600',
    color: ACCENT_GREEN,
    marginBottom: 32,
  },
  resendLinkDisabled: {
    opacity: 0.6,
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
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: white,
    fontSize: 17,
    fontWeight: '700',
  },
});
