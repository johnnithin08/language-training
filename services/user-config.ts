import { generateClient } from "aws-amplify/api";

export type UserConfig = {
	id: string;
	voiceToVoiceEnabled: boolean;
	voiceId: string;
};

const DEFAULT_VOICE_ID = "tiffany";

const client = generateClient();

const listUserConfigsQuery = /* GraphQL */ `
	query ListUserConfigs($limit: Int) {
		listUserConfigs(limit: $limit) {
			items {
				id
				voiceToVoiceEnabled
				voiceId
				owner
			}
		}
	}
`;

const createUserConfigMutation = /* GraphQL */ `
	mutation CreateUserConfig($input: CreateUserConfigInput!) {
		createUserConfig(input: $input) {
			id
			voiceToVoiceEnabled
			voiceId
		}
	}
`;

const updateUserConfigMutation = /* GraphQL */ `
	mutation UpdateUserConfig($input: UpdateUserConfigInput!) {
		updateUserConfig(input: $input) {
			id
			voiceToVoiceEnabled
			voiceId
		}
	}
`;

export async function getUserConfig(): Promise<UserConfig | null> {
	const response = await client.graphql({
		query: listUserConfigsQuery,
		variables: { limit: 1 },
		authMode: "userPool",
	});

	if ("errors" in response && response.errors?.length) {
		const msg = response.errors.map((e) => e.message).join("; ");
		throw new Error(msg || "GraphQL error");
	}

	const data = response.data as {
		listUserConfigs?: { items?: (UserConfig | null)[] | null } | null;
	};
	return data.listUserConfigs?.items?.find(Boolean) ?? null;
}

export async function createUserConfig(
	overrides?: Partial<Pick<UserConfig, "voiceToVoiceEnabled" | "voiceId">>,
): Promise<UserConfig> {
	const input = {
		voiceToVoiceEnabled: overrides?.voiceToVoiceEnabled ?? false,
		voiceId: overrides?.voiceId ?? DEFAULT_VOICE_ID,
	};

	const response = await client.graphql({
		query: createUserConfigMutation,
		variables: { input },
		authMode: "userPool",
	});

	if ("errors" in response && response.errors?.length) {
		const msg = response.errors.map((e) => e.message).join("; ");
		throw new Error(msg || "GraphQL error");
	}

	const data = response.data as {
		createUserConfig?: UserConfig | null;
	};
	if (!data.createUserConfig) throw new Error("Failed to create config");
	return data.createUserConfig;
}

export async function updateUserConfig(
	id: string,
	updates: Partial<Pick<UserConfig, "voiceToVoiceEnabled" | "voiceId">>,
): Promise<UserConfig> {
	const response = await client.graphql({
		query: updateUserConfigMutation,
		variables: { input: { id, ...updates } },
		authMode: "userPool",
	});

	if ("errors" in response && response.errors?.length) {
		const msg = response.errors.map((e) => e.message).join("; ");
		throw new Error(msg || "GraphQL error");
	}

	const data = response.data as {
		updateUserConfig?: UserConfig | null;
	};
	if (!data.updateUserConfig) throw new Error("Failed to update config");
	return data.updateUserConfig;
}

/** Get or create — ensures the user always has a config row. */
export async function getOrCreateUserConfig(): Promise<UserConfig> {
	const existing = await getUserConfig();
	if (existing) return existing;
	return createUserConfig();
}
