import { app, colors, white } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";
import { signIn as amplifySignIn } from "aws-amplify/auth";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function getAuthErrorMessage(err: unknown): string {
	if (err && typeof err === "object" && "name" in err) {
		const name = (err as { name: string }).name;
		const message = (err as { message?: string }).message ?? "";
		if (
			name === "UserNotFoundException" ||
			message.includes("User does not exist")
		)
			return "No account found with this email.";
		if (
			name === "NotAuthorizedException" ||
			message.includes("Incorrect username or password")
		)
			return "Incorrect email or password.";
		if (name === "UserNotConfirmedException")
			return "Please verify your email with the code we sent.";
		// Amplify Auth uses native crypto; in Expo Go the native module is missing → "Unknown error"
		if (
			name === "Unknown" ||
			message.toLowerCase().includes("unknown error")
		) {
			const isExpoGo = Constants.appOwnership === "expo";
			if (isExpoGo) {
				return "Sign-in requires a development build (Amplify uses native code that Expo Go doesn’t include). Run: npx expo prebuild && npx expo run:ios";
			}
		}
	}
	return "Something went wrong. Please try again.";
}

function logAuthError(err: unknown): void {
	if (__DEV__ && err != null) {
		const e = err as Record<string, unknown>;
		console.warn("[Auth error]", {
			name: e.name,
			message: e.message,
			underlyingError: e.underlyingError ?? e.cause,
			stack: e.stack,
		});
	}
}

export default function LoginScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { signIn } = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleLogin = async () => {
		setError("");
		const trimmedEmail = email.trim();
		if (!trimmedEmail || !password) {
			setError("Please enter email and password.");
			return;
		}
		setLoading(true);
		try {
			await amplifySignIn({
				username: trimmedEmail,
				password,
			});
			signIn();
			router.replace("/(app)");
		} catch (err) {
			logAuthError(err);
			setError(getAuthErrorMessage(err));
		} finally {
			setLoading(false);
		}
	};

	return (
		<KeyboardAvoidingView
			style={styles.container}
			behavior={Platform.OS === "ios" ? "padding" : undefined}
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
				<Text style={styles.title}>Login</Text>
				<Text style={styles.subtitle}>
					You're all set. Sign in to continue.
				</Text>

				<Text style={styles.label}>Email Address</Text>
				<TextInput
					style={styles.input}
					placeholder="you@example.com"
					placeholderTextColor={colors.slate[400]}
					value={email}
					onChangeText={(t) => {
						setEmail(t);
						setError("");
					}}
					keyboardType="email-address"
					autoCapitalize="none"
					autoCorrect={false}
				/>

				<Text style={styles.label}>Password</Text>
				<TextInput
					style={styles.input}
					placeholder="••••••••"
					placeholderTextColor={colors.slate[400]}
					value={password}
					onChangeText={(t) => {
						setPassword(t);
						setError("");
					}}
					secureTextEntry
				/>

				{error ? <Text style={styles.errorText}>{error}</Text> : null}

				<Pressable
					style={({ pressed }) => [
						styles.button,
						pressed && styles.buttonPressed,
						loading && styles.buttonDisabled,
					]}
					onPress={handleLogin}
					disabled={loading}
				>
					{loading ? (
						<ActivityIndicator color={white} />
					) : (
						<Text style={styles.buttonText}>Sign in</Text>
					)}
				</Pressable>

				<Pressable
					onPress={() => router.push("/(auth)/setup")}
					style={styles.ctaLink}
					hitSlop={8}
				>
					<Text style={styles.ctaText}>
						Don't have an account?{" "}
						<Text style={styles.ctaHighlight}>Sign up</Text>
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
		flexGrow: 1,
		justifyContent: "center",
	},
	title: {
		fontSize: 28,
		fontWeight: "700",
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
		fontWeight: "500",
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
		alignItems: "center",
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
		fontWeight: "700",
	},
	ctaLink: {
		marginTop: 24,
		alignItems: "center",
	},
	ctaText: {
		fontSize: 15,
		color: app.textMuted,
	},
	ctaHighlight: {
		color: app.buttonPrimary,
		fontWeight: "600",
	},
});
