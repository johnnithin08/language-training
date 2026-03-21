/**
 * Per-category opening: first user message instructs the model to speak first in scenario.
 * SPEECH_OUTPUT_NOTE is appended to every opening prompt (and mirrored in Lambda system prompt for follow-ups — keep wording in sync with bedrockAssistant/src/index.js).
 */

/** Appended to each opening prompt; same substance as Lambda SPEECH_OUTPUT_NOTE. */
export const SPEECH_OUTPUT_NOTE =
	"Note: Replies are read aloud with Expo Speech. Use plain text only: letters, numbers, spaces, and basic punctuation (periods, commas, question marks, apostrophes in words). Do not use emojis, asterisks, markdown, bullet lists, quotation marks for formatting, angle brackets, or other special symbols.";

export type ConversationCategory = {
	id: string;
	title: string;
	emoji: string;
	/** First user message (scenario) before the shared speech note is appended. */
	openingPrompt: string;
};

export const CONVERSATION_CATEGORIES: ConversationCategory[] = [
	{
		id: "restaurant",
		title: "Restaurant",
		emoji: "🍽️",
		openingPrompt:
			"The roleplay begins now. You are the restaurant host or waiter. Speak first: welcome the guest and ask how many people or if they have a reservation. Stay in character. Keep it to one or two short sentences.",
	},
	{
		id: "hotel-checkin",
		title: "Hotel Check-in",
		emoji: "🏨",
		openingPrompt:
			"The roleplay begins now. You are the hotel front desk. Speak first: greet the guest and ask for their name or booking details. Stay in character. Keep it to one or two short sentences.",
	},
	{
		id: "shopping",
		title: "Shopping",
		emoji: "🛍️",
		openingPrompt:
			"The roleplay begins now. You are a shop assistant. Speak first: greet the customer and ask what they are looking for. Stay in character. Keep it to one or two short sentences.",
	},
	{
		id: "taxi",
		title: "Getting a Taxi",
		emoji: "🚕",
		openingPrompt:
			"The roleplay begins now. You are the taxi driver. Speak first: greet the passenger and ask where they would like to go. Stay in character. Keep it to one or two short sentences.",
	},
	{
		id: "introductions",
		title: "Introductions",
		emoji: "👋",
		openingPrompt:
			"The conversation begins now. Speak first: briefly introduce yourself as a friendly practice partner and ask one simple icebreaker question. Keep it to one or two short sentences.",
	},
	{
		id: "doctor",
		title: "At the Doctor",
		emoji: "🏥",
		openingPrompt:
			"The roleplay begins now. You are the doctor or clinic receptionist. Speak first: greet the patient and ask what brings them in today. Stay in character. Keep it to one or two short sentences.",
	},
	{
		id: "plans",
		title: "Making Plans",
		emoji: "🎉",
		openingPrompt:
			"The roleplay begins now. You are a friend making plans. Speak first: suggest meeting up and ask if they are free. Stay casual. Keep it to one or two short sentences.",
	},
	{
		id: "job-interview",
		title: "Job Interview",
		emoji: "💼",
		openingPrompt:
			"The roleplay begins now. You are the interviewer. Speak first: greet the candidate and ask one short opening question. Stay professional. Keep it to one or two short sentences.",
	},
	{
		id: "directions",
		title: "Asking Directions",
		emoji: "🗺️",
		openingPrompt:
			"The roleplay begins now. You are a helpful local. Speak first: greet them and ask where they are trying to go. Stay in character. Keep it to one or two short sentences.",
	},
	{
		id: "free-talk",
		title: "Free Talk",
		emoji: "🎭",
		openingPrompt:
			"The conversation begins now. Speak first: give a friendly greeting and ask one open question to chat. Keep it to one or two short sentences.",
	},
];

const byId = new Map(
	CONVERSATION_CATEGORIES.map((c) => [c.id, c] as const),
);

export function getCategoryById(
	categoryId?: string | null,
): ConversationCategory | undefined {
	if (!categoryId) return undefined;
	return byId.get(categoryId);
}

export function getOpeningPrompt(categoryId?: string | null): string {
	const base =
		getCategoryById(categoryId)?.openingPrompt ??
		byId.get("free-talk")!.openingPrompt;
	return `${base}\n\n${SPEECH_OUTPUT_NOTE}`;
}

export function getCategoryDisplayLabel(categoryId?: string | null): string {
	const c = getCategoryById(categoryId) ?? byId.get("free-talk")!;
	return `${c.emoji} ${c.title}`;
}
