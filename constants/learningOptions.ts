export type LearningOption = {
	id: string;
	title: string;
	subtitle: string;
	emoji: string;
};

export const LANGUAGE_OPTIONS: LearningOption[] = [
	{ id: "english", title: "English", subtitle: "English", emoji: "🇺🇸" },
];

export const LEVEL_OPTIONS: LearningOption[] = [
	{
		id: "beginner",
		title: "Beginner",
		subtitle: "I know a few words and phrases",
		emoji: "🌱",
	},
	{
		id: "elementary",
		title: "Elementary",
		subtitle: "I can have simple conversations",
		emoji: "📘",
	},
	{
		id: "intermediate",
		title: "Intermediate",
		subtitle: "I can discuss everyday topics",
		emoji: "🗣️",
	},
	{
		id: "advanced",
		title: "Advanced",
		subtitle: "I am nearly fluent but want to refine",
		emoji: "🎓",
	},
];
