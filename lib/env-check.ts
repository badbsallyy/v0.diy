export interface MissingEnvVar {
  name: string;
  description: string;
  example: string;
  required: boolean;
}

export function checkRequiredEnvVars(): MissingEnvVar[] {
  const requiredVars: MissingEnvVar[] = [
    {
      name: "AUTH_SECRET",
      description: "Secret key for NextAuth.js authentication",
      example: "your-secret-key-here",
      required: true,
    },
    {
      name: "POSTGRES_URL",
      description: "PostgreSQL database connection string",
      example: "", // No example - user needs to provide their own
      required: true,
    },
  ];

  const missing = requiredVars.filter((envVar) => {
    const value = process.env[envVar.name];
    return !value || value.trim() === "";
  });

  // At least one AI provider API key must be set
  const hasOpenAI = !!process.env.OPENAI_API_KEY?.trim();
  const hasGemini = !!process.env.GEMINI_API_KEY?.trim();

  if (!(hasOpenAI || hasGemini)) {
    missing.push({
      name: "OPENAI_API_KEY or GEMINI_API_KEY",
      description:
        "At least one AI provider API key is required (OpenAI or Google Gemini)",
      example: "sk-... or AIza...",
      required: true,
    });
  }

  return missing;
}

export function hasAllRequiredEnvVars(): boolean {
  return checkRequiredEnvVars().length === 0;
}

const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasGemini = !!process.env.GEMINI_API_KEY;

export const hasEnvVars = !!(
  (hasOpenAI || hasGemini) &&
  process.env.AUTH_SECRET &&
  process.env.POSTGRES_URL
);
