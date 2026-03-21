import { generateClient } from "aws-amplify/api";
import { type AssistantMessage, getAssistantReply } from "./assistant-reply";

export type SessionAnalysisScores = {
	grammar: number;
	fluency: number;
	vocabulary: number;
	coherence: number;
	overall: number;
};

export type CorrectedExample = {
	original: string;
	corrected: string;
};

export type SessionAnalysis = {
	scores: SessionAnalysisScores;
	cefr_level: string;
	strengths: string[];
	weaknesses: string[];
	common_mistakes: string[];
	corrected_examples: CorrectedExample[];
	suggestions: string[];
};

export type SessionListItem = {
	id: string;
	categoryId: string;
	targetLanguage: string;
	createdAt: string;
	analysis: SessionAnalysis | null;
};

const client = generateClient();

const createSessionMutation = /* GraphQL */ `
	mutation CreateSession($input: CreateSessionInput!) {
		createSession(input: $input) {
			id
			createdAt
		}
	}
`;

const listSessionsQuery = /* GraphQL */ `
	query ListSessions($limit: Int) {
		listSessions(limit: $limit) {
			items {
				id
				categoryId
				targetLanguage
				createdAt
				analysisJson
			}
		}
	}
`;

const getSessionQuery = /* GraphQL */ `
	query GetSession($id: ID!) {
		getSession(id: $id) {
			id
			categoryId
			targetLanguage
			createdAt
			analysisJson
		}
	}
`;

export type SessionDetail = {
	id: string;
	categoryId: string;
	targetLanguage: string;
	createdAt: string;
	analysis: SessionAnalysis | null;
};

export async function getSessionById(
	id: string,
): Promise<SessionDetail | null> {
	const response = await client.graphql({
		query: getSessionQuery,
		variables: { id },
		authMode: "userPool",
	});

	if ("errors" in response && response.errors?.length) {
		const msg = response.errors.map((e) => e.message).join("; ");
		throw new Error(msg || "GraphQL error");
	}

	if (!("data" in response)) {
		throw new Error("No data in GraphQL response");
	}

	const row = (
		response.data as {
			getSession?: {
				id: string;
				categoryId: string;
				targetLanguage: string;
				createdAt: string;
				analysisJson?: unknown;
			} | null;
		}
	).getSession;

	if (!row) return null;

	return {
		id: row.id,
		categoryId: row.categoryId,
		targetLanguage: row.targetLanguage,
		createdAt: row.createdAt,
		analysis: asSessionAnalysis(parseAwsJson(row.analysisJson)),
	};
}

/**
 * Analysis instructions only. The practice thread is sent separately as full
 * `messages` + this as the final user turn (no copied/filtered transcript).
 */
export function buildSessionAnalysisPrompt(): string {
	return `SESSION END — STRUCTURED REVIEW (required app output)

This is not a chat reply. The learner finished practice; the app needs machine-readable feedback for the UI.

You MUST output exactly one JSON object as specified below. Do not refuse, apologize, or say you cannot analyze or score. Do not continue the roleplay or ask questions. Do not address the user by name in prose — there is no user-facing text except inside the JSON strings.

Educational assessment of the learner's English from their lines is allowed and expected. Use the thread only as evidence: score and comment on the USER's English only (ignore assistant lines for scoring, but you may read them for context).

---

### SCORING CRITERIA (0–10)

grammar:
- Correct use of tense, sentence structure, and agreement

fluency:
- Natural flow and ease of expression

vocabulary:
- Range and appropriateness of vocabulary

coherence:
- Logical connection of ideas and clarity across sentences

overall:
- Balanced average of the above scores

---

### ALSO PROVIDE:

- cefr_level (A1, A2, B1, B2, C1, or C2)

- strengths (3–5 short bullet points)
- weaknesses (3–5 short bullet points)

- common_mistakes (list repeated or important mistakes)

- corrected_examples (up to 5):
  Each item:
  {
    "original": "...",
    "corrected": "..."
  }

- suggestions (3–5 actionable tips)

---

### RULES:

- Be consistent and objective
- Score conservatively (avoid scores above 8 unless clearly advanced)
- Focus on patterns, not one-off mistakes
- Be constructive and encouraging
- Keep feedback concise and clear
- Output a single compact JSON object only (no markdown fences, no preamble, no closing remarks); short strings in arrays

---

### OUTPUT FORMAT (STRICT):

Return ONLY valid JSON (nothing else before or after):

{
  "scores": {
    "grammar": number,
    "fluency": number,
    "vocabulary": number,
    "coherence": number,
    "overall": number
  },
  "cefr_level": "B1",
  "strengths": [],
  "weaknesses": [],
  "common_mistakes": [],
  "corrected_examples": [],
  "suggestions": []
}`;
}

function extractJsonObject(text: string): unknown {
	const trimmed = text.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
	const body = fenced ? fenced[1].trim() : trimmed;
	const start = body.indexOf("{");
	const end = body.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) {
		throw new Error("Model did not return JSON");
	}
	return JSON.parse(body.slice(start, end + 1));
}

function parseAwsJson(value: unknown): unknown {
	if (value == null) return null;
	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}
	return value;
}

function asSessionAnalysis(value: unknown): SessionAnalysis | null {
	if (!value || typeof value !== "object") return null;
	const o = value as Record<string, unknown>;
	const scores = o.scores;
	if (!scores || typeof scores !== "object") return null;
	const s = scores as Record<string, unknown>;
	return {
		scores: {
			grammar: Number(s.grammar) || 0,
			fluency: Number(s.fluency) || 0,
			vocabulary: Number(s.vocabulary) || 0,
			coherence: Number(s.coherence) || 0,
			overall: Number(s.overall) || 0,
		},
		cefr_level: String(o.cefr_level ?? ""),
		strengths: Array.isArray(o.strengths) ? o.strengths.map(String) : [],
		weaknesses: Array.isArray(o.weaknesses) ? o.weaknesses.map(String) : [],
		common_mistakes: Array.isArray(o.common_mistakes)
			? o.common_mistakes.map(String)
			: [],
		corrected_examples: Array.isArray(o.corrected_examples)
			? (o.corrected_examples as unknown[])
					.filter(
						(x): x is { original?: string; corrected?: string } =>
							x != null && typeof x === "object",
					)
					.map((x) => ({
						original: String(x.original ?? ""),
						corrected: String(x.corrected ?? ""),
					}))
			: [],
		suggestions: Array.isArray(o.suggestions)
			? o.suggestions.map(String)
			: [],
	};
}

/**
 * Sends the full practice `messages`, then the analysis prompt as the last user turn.
 */
export async function analyzeSession(
	messages: AssistantMessage[],
): Promise<SessionAnalysis> {
	if (!messages.length) {
		throw new Error("messages must not be empty");
	}

	const analysisPrompt = buildSessionAnalysisPrompt();
	const messagesForApi: AssistantMessage[] = [
		...messages,
		{ role: "user", content: analysisPrompt },
	];

	const raw = await getAssistantReply(messagesForApi, {
		sessionAnalysisTurn: true,
		maxTokens: 4096,
	});
	const parsed = extractJsonObject(raw);
	const analysis = asSessionAnalysis(parsed);
	if (!analysis) {
		throw new Error("Invalid session analysis response");
	}
	return analysis;
}

export type SaveSessionParams = {
	categoryId: string;
	targetLanguage: string;
	analysis: SessionAnalysis;
};

export async function saveSession(params: SaveSessionParams): Promise<string> {
	const { categoryId, targetLanguage, analysis } = params;

	const response = await client.graphql({
		query: createSessionMutation,
		variables: {
			input: {
				categoryId,
				targetLanguage,
				analysisJson: JSON.stringify(analysis),
			},
		},
		authMode: "userPool",
	});

	if ("errors" in response && response.errors?.length) {
		const msg = response.errors.map((e) => e.message).join("; ");
		throw new Error(msg || "GraphQL error");
	}

	if (!("data" in response)) {
		throw new Error("No data in GraphQL response");
	}

	const id = (
		response.data as {
			createSession?: { id?: string | null } | null;
		}
	).createSession?.id;
	if (!id) {
		throw new Error("Session was not created");
	}
	return id;
}

const DEFAULT_LIST_LIMIT = 50;

export async function listRecentSessions(
	limit = DEFAULT_LIST_LIMIT,
): Promise<SessionListItem[]> {
	const response = await client.graphql({
		query: listSessionsQuery,
		variables: { limit },
		authMode: "userPool",
	});

	if ("errors" in response && response.errors?.length) {
		const msg = response.errors.map((e) => e.message).join("; ");
		throw new Error(msg || "GraphQL error");
	}

	if (!("data" in response)) {
		throw new Error("No data in GraphQL response");
	}

	const items =
		(
			response.data as {
				listSessions?: {
					items?: Array<{
						id: string;
						categoryId: string;
						targetLanguage: string;
						createdAt: string;
						analysisJson?: unknown;
					} | null>;
				};(
			}
		).listSessions?.items ?? [];

	const mapped: SessionListItem[] = items
		.filter((x): x is NonNullable<typeof x> => x != null)
		.map((row) )[]> ({
			id: row.id,
			categoryId: row.categoryId,
			targetLanguage: row.targetLanguage,
			createdAt: row.createdAt,
			analysis: asSessionAnalysis(parseAwsJson(row.analysisJson)),
		}));

	mapped.sort(
		(a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	return mapped;
}

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

const CEFR_LABELS: Record<string, string> = {
	A1: "Beginner",
	A2: "Elementary",
	B1: "Intermediate",
	B2: "Upper intermediate",
	C1: "Advanced",
	C2: "Proficient",
};

export function cefrLabel(code: string): string {
	const k = code.trim().toUpperCase().slice(0, 2);
	return CEFR_LABELS[k] ?? "—";
}

export function cefrIndex(code: string): number {
	const k = code.trim().toUpperCase().slice(0, 2);
	return CEFR_ORDER.indexOf(k as (typeof CEFR_ORDER)[number]);
}

export function analysisFeedbackHeadline(overall: number): string {
	if (overall >= 8) return "Excellent work!";
	if (overall >= 6.5) return "Great progress!";
	if (overall >= 5) return "Good effort!";
	return "Keep practicing!";
}

export function analysisFeedbackSubtitle(analysis: SessionAnalysis): string {
	const s = analysis.strengths[0] ?? analysis.suggestions[0];
	return s ?? "You're improving steadily. Keep practicing daily!";
}

export function formatSessionMeta(createdAtIso: string): string {
	const d = new Date(createdAtIso);
	if (Number.isNaN(d.getTime())) return "";
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffDays = Math.floor(diffMs / (86400 * 1000));
	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return `${diffDays} days ago`;
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

export function scoreToDisplayColor(score: number): string {
	if (score >= 7.5) return "#2dd4bf";
	if (score >= 6) return "#38bdf8";
	return "#f97316";
}
