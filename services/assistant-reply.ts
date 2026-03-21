import { generateClient } from "aws-amplify/api";

export type AssistantMessage = {
	role: "user" | "assistant";
	content: string;
};

export type AssistantReplyOptions = {
	targetLanguage?: string;
	categoryId?: string;
	maxTokens?: number;
	sessionAnalysisTurn?: boolean;
};

const client = generateClient();

const assistantReplyQuery = /* GraphQL */ `
	query AssistantReply(
		$messages: [AssistantMessageInput!]!
		$targetLanguage: String
		$categoryId: String
		$maxTokens: Int
		$sessionAnalysisTurn: Boolean
	) {
		assistantReply(
			messages: $messages
			targetLanguage: $targetLanguage
			categoryId: $categoryId
			maxTokens: $maxTokens
			sessionAnalysisTurn: $sessionAnalysisTurn
		)
	}
`;

/**
 * Assistant text via AppSync → Lambda → Amazon Bedrock (option B).
 */
export async function getAssistantReply(
	messages: AssistantMessage[],
	options: AssistantReplyOptions = {},
): Promise<string> {
	if (!messages.length) {
		throw new Error("messages must not be empty");
	}

	const response = await client.graphql({
		query: assistantReplyQuery,
		variables: {
			messages: messages.map((m) => ({
				role: m.role,
				content: m.content,
			})),
			targetLanguage: options.targetLanguage ?? null,
			categoryId: options.categoryId ?? null,
			maxTokens: options.maxTokens ?? null,
			sessionAnalysisTurn: options.sessionAnalysisTurn ?? null,
		},
		authMode: "userPool",
	});

	console.log("response from assistantReply", response);

	if ("errors" in response && response.errors?.length) {
		const msg = response.errors.map((e) => e.message).join("; ");
		throw new Error(msg || "GraphQL error");
	}

	if (!("data" in response)) {
		throw new Error("No data in GraphQL response");
	}

	const data = response.data as { assistantReply?: string | null };
	const text = data?.assistantReply?.trim();
	if (!text) {
		throw new Error("Empty assistant response");
	}
	return text;
}
