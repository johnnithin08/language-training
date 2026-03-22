import AsyncStorage from "@react-native-async-storage/async-storage";
import { PermissionsAndroid, Platform } from "react-native";

const MIC_PERMISSION_KEY = "@language_training/mic_permission";

type StoredMicPermission = "granted" | "denied";

async function readStored(): Promise<StoredMicPermission | null> {
	const v = await AsyncStorage.getItem(MIC_PERMISSION_KEY);
	if (v === "granted" || v === "denied") return v;
	return null;
}

async function writeStored(value: StoredMicPermission): Promise<void> {
	await AsyncStorage.setItem(MIC_PERMISSION_KEY, value);
}

/**
 * Android: sync runtime `RECORD_AUDIO` with AsyncStorage.
 *
 * iOS: There is no extra JS dependency for mic + speech here. `NSMicrophoneUsageDescription` and
 * `NSSpeechRecognitionUsageDescription` are in app.json; VoiceKit requests authorization when
 * you start listening. We treat iOS as allowed so Home does not block New Conversation.
 */
export async function syncMicPermissionState(): Promise<boolean> {
	if (Platform.OS === "web") {
		return true;
	}
	if (Platform.OS === "ios") {
		return true;
	}

	const granted = await PermissionsAndroid.check(
		PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
	);

	if (granted) {
		await writeStored("granted");
		return true;
	}

	const prev = await readStored();

	if (prev === "denied") {
		return false;
	}

	if (prev === "granted") {
		await writeStored("denied");
		return false;
	}

	const result = await PermissionsAndroid.request(
		PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
	);
	const ok = result === PermissionsAndroid.RESULTS.GRANTED;
	await writeStored(ok ? "granted" : "denied");
	return ok;
}

/** Same behavior as {@link syncMicPermissionState} — kept for call sites. */
export const ensureMicPermission = syncMicPermissionState;

/** Last known persisted state (Android). Useful for instant UI before sync completes. */
export async function getStoredMicPermission(): Promise<StoredMicPermission | null> {
	if (Platform.OS !== "android") return null;
	return readStored();
}
