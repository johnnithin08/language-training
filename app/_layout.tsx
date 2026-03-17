import { AuthProvider } from "@/contexts/auth";
import { Amplify } from "aws-amplify";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-get-random-values";
import { SafeAreaProvider } from "react-native-safe-area-context";
import amplifyconfig from "../src/amplifyconfiguration.json";

Amplify.configure(amplifyconfig);

export default function RootLayout() {
	return (
		<SafeAreaProvider>
			<AuthProvider>
				<Stack screenOptions={{ headerShown: false }} />
				<StatusBar style="light" />
			</AuthProvider>
		</SafeAreaProvider>
	);
}
