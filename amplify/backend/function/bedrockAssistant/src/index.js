const {
	BedrockRuntimeClient,
	InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-sonnet-4-6";

function toAnthropicMessages(items) {
	if (!Array.isArray(items) || items.length === 0) {
		throw new Error("messages must be a non-empty array");
	}
	return items.map((m, i) => {
		const role = typeof m.role === "string" ? m.role.trim().toLowerCase() : "";
		const content = typeof m.content === "string" ? m.content.trim() : "";
		if (!content) {
			throw new Error(`messages[${i}]: content is required`);
		}
		if (role !== "user" && role !== "assistant") {
			throw new Error(
				`messages[${i}]: role must be "user" or "assistant"`,
			);
		}
		return {
			role,
			content: [{ type: "text", text: content }],
		};
	});
}

/**
 * AppSync resolver for Query.assistantReply
 */
exports.handler = async (event) => {
	const args = event.arguments || {};
	const rawMessages = args.messages;
	const targetLanguage = args.targetLanguage;
	const categoryId = args.categoryId;

	// Keep in sync with SPEECH_OUTPUT_NOTE in constants/conversationCategoryConfig.ts
	const SPEECH_OUTPUT_NOTE =
		"Note: Replies are read aloud with Expo Speech. Use plain text only: letters, numbers, spaces, and basic punctuation (periods, commas, question marks, apostrophes in words). Do not use emojis, asterisks, markdown, bullet lists, quotation marks for formatting, angle brackets, or other special symbols.";

	let system =
		"You are a friendly language practice partner. Keep replies concise and natural for spoken aloud.";
	if (targetLanguage) {
		system = `You are a friendly language practice partner. The user is learning ${targetLanguage}. Respond helpfully and concisely, primarily in ${targetLanguage}; use brief English only if needed for clarity. Keep responses short for text-to-speech.`;
	}
	if (categoryId) {
		system += ` Current practice category: ${categoryId}.`;
	}
	system += ` ${SPEECH_OUTPUT_NOTE}`;

	const messages = toAnthropicMessages(rawMessages);

	const payload = {
		anthropic_version: "bedrock-2023-05-31",
		max_tokens: 512,
		system,
		messages,
	};

	const region = process.env.AWS_REGION || "eu-west-2";
	const client = new BedrockRuntimeClient({ region });
	const response = await client.send(
		new InvokeModelCommand({
			modelId: MODEL_ID,
			contentType: "application/json",
			accept: "application/json",
			body: Buffer.from(JSON.stringify(payload)),
		}),
	);

	const raw = response.body;
	if (!raw) {
		throw new Error("Empty response from Bedrock");
	}
	const json = JSON.parse(Buffer.from(raw).toString("utf8"));
	const text = json.content?.[0]?.text?.trim();
	if (!text) {
		throw new Error("No assistant text in model response");
	}
	return text;
};
