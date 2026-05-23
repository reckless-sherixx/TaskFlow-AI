export type ModelEntry = {
	id: string;
	label: string;
	provider: string;
};

export const MODELS: ModelEntry[] = [
	// OpenAI
	{ id: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
	// Google
	{ id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", provider: "Google" },
	// DeepSeek
	{ id: "deepseek/deepseek-v4-flash:free", label: "DeepSeek V4 Flash", provider: "DeepSeek" },
	// Meta
	{ id: "meta-llama/llama-4-maverick:free", label: "Llama 4 Maverick", provider: "Meta" },
	{ id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", provider: "Meta" },
];

export const VALID_MODELS = new Set(MODELS.map((m) => m.id));

export const DEFAULT_MODEL = MODELS[0].id;

export const MODEL_LABELS: Record<string, string> = Object.fromEntries(
	MODELS.map((m) => [m.id, m.label]),
);


export function getModelsByProvider(): Record<string, ModelEntry[]> {
	const groups: Record<string, ModelEntry[]> = {};
	for (const m of MODELS) {
		if (!groups[m.provider]) groups[m.provider] = [];
		groups[m.provider].push(m);
	}
	return groups;
}

export function isValidModel(model: string): boolean {
	return VALID_MODELS.has(model);
}

export function resolveModel(model: string | undefined | null): string {
	if (model && isValidModel(model)) return model;
	return DEFAULT_MODEL;
}
