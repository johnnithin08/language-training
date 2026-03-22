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
			"You are an English language tutor. The user's last message requests a structured end-of-session assessment. Follow it exactly. Respond with valid JSON only — no refusal, no roleplay, no markdown fences, no text before or after the JSON object.";
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

	const messages = toAnthropicMessages(rawMessages);

	const maxTokens = (() => {
		if (requestedMax != null && requestedMax > 0) {
			return Math.min(requestedMax, 8192);
		}
		return sessionAnalysisTurn ? 4096 : 512;
	})();

	const payload = {
		anthropic_version: "bedrock-2023-05-31",
		max_tokens: maxTokens,
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
