const {
	BedrockRuntimeClient,
	ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");

/** In-region ID for eu-west-2 — see https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-pro.html */
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "amazon.nova-pro-v1:0";

/** Nova Pro max output tokens (model card). */
const NOVA_MAX_OUTPUT = 5000;

/**
 * AppSync messages → Bedrock Converse messages (Nova text format).
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_Converse_AmazonNovaText_section.html
 */
function toNovaMessages(items) {
	if (!Array.isArray(items) || items.length === 0) {
		throw new Error("messages must be a non-empty array");
	}
	return items.map((m, i) => {
		const role = typeof m.role === "string" ? m.role.trim().toLowerCase() : "";
		const text = typeof m.content === "string" ? m.content.trim() : "";
		if (!text) {
			throw new Error(`messages[${i}]: content is required`);
		}
		if (role !== "user" && role !== "assistant") {
			throw new Error(
				`messages[${i}]: role must be "user" or "assistant"`,
			);
		}
		return {
			role,
			content: [{ text }],
		};
	});
}

function extractAssistantText(output) {
	const blocks = output?.message?.content;
	if (!Array.isArray(blocks) || blocks.length === 0) {
		return "";
	}
	for (const block of blocks) {
		if (block && typeof block.text === "string" && block.text.trim()) {
			return block.text.trim();
		}
	}
	return "";
}

/**
 * AppSync resolver for Query.assistantReply
 */
exports.handler = async (event) => {
	const args = event.arguments || {};
	const rawMessages = args.messages;
	const targetLanguage = args.targetLanguage;
	const categoryId = args.categoryId;
	const sessionAnalysisTurn = args.sessionAnalysisTurn === true;
	const languageLevel =
		typeof args.languageLevel === "string" && args.languageLevel.trim()
			? args.languageLevel.trim()
			: null;
	const requestedMax =
		typeof args.maxTokens === "number" && Number.isFinite(args.maxTokens)
			? Math.floor(args.maxTokens)
			: null;

	// Keep in sync with SPEECH_OUTPUT_NOTE in constants/conversationCategoryConfig.ts
	const SPEECH_OUTPUT_NOTE =
		"Note: Replies are read aloud with Expo Speech. Use plain text only: letters, numbers, spaces, and basic punctuation (periods, commas, question marks, apostrophes in words). Do not use emojis, asterisks, markdown, bullet lists, quotation marks for formatting, angle brackets, or other special symbols.";

	let system;
	if (sessionAnalysisTurn) {
		system =
			"You are an English language tutor. The user's last message requests a structured end-of-session assessment. Follow it exactly. Respond with valid JSON only — no refusal, no roleplay, no markdown fences, no text before or after the JSON object. Practice thread text is speech-to-text: do not treat punctuation as mistakes or score it in grammar.";
		if (languageLevel) {
			system += ` The learner self-reported their level as: ${languageLevel}. Use this as context when scoring and when choosing cefr_level in the JSON (evidence in the thread takes priority if they conflict).`;
		}
	} else {
		system =
			"You are a friendly language practice partner. Keep replies concise and natural for spoken aloud.";
		if (targetLanguage) {
			system = `You are a friendly language practice partner. The user is learning ${targetLanguage}. Respond helpfully and concisely, primarily in ${targetLanguage}; use brief English only if needed for clarity. Keep responses short for text-to-speech.`;
		}
		if (languageLevel) {
			system += ` The learner self-reported their level is: ${languageLevel}. Adjust sentence length, vocabulary, and challenge to suit this level.`;
		}
		if (categoryId) {
			system += ` Current practice category: ${categoryId}.`;
		}
		system += ` ${SPEECH_OUTPUT_NOTE}`;
	}

	const messages = toNovaMessages(rawMessages);

	const maxTokens = (() => {
		if (requestedMax != null && requestedMax > 0) {
			return Math.min(requestedMax, NOVA_MAX_OUTPUT);
		}
		return sessionAnalysisTurn
			? Math.min(4096, NOVA_MAX_OUTPUT)
			: Math.min(512, NOVA_MAX_OUTPUT);
	})();

	const region = process.env.AWS_REGION || "eu-west-2";
	const client = new BedrockRuntimeClient({ region });

	const response = await client.send(
		new ConverseCommand({
			modelId: MODEL_ID,
			system: [{ text: system }],
			messages,
			inferenceConfig: {
				maxTokens,
				temperature: 0.7,
			},
		}),
	);

	const text = extractAssistantText(response.output);
	if (!text) {
		throw new Error("No assistant text in model response");
	}
	return text;
};
