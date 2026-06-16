import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().optional(),
  USE_MEMORY_STORE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  CORS_ORIGIN: z.string().default("*"),
  DEEPSEEK_API_KEY: z.string().min(1, "DEEPSEEK_API_KEY is required"),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  AGENT_MAX_TOOL_ITERATIONS: z.coerce.number().default(8),
  AGENT_MAX_TOKENS: z.coerce.number().default(2048),
  AGENT_TEMPERATURE: z.coerce.number().default(0.1),
  SUPABASE_URL: z.string().min(1, "SUPABASE_URL is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_KEY: z.string().optional(),
  SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "SUPABASE_PUBLISHABLE_KEY is required"),
  SUPABASE_ANON_KEY: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  DQ_CTA_URL: z.string().optional(),
  CLIENT_CONTEXT_LABEL: z.string().optional(),
  MAX_DOCUMENT_SIZE_MB: z.coerce.number().default(10),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function resetEnvCache(): void {
  cached = null;
}

export function getEnv(): Env;
export function getEnv(name: string): string | undefined;
export function getEnv(name?: string): Env | string | undefined {
  if (name) {
    const value = process.env[name];
    return value && value.trim().length > 0 ? value.trim() : undefined;
  }

  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `Invalid env: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}

export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function isConfigured(...names: string[]): boolean {
  return names.every((name) => Boolean(getEnv(name)));
}

export function getActiveModel(): string {
  const env = getEnv();
  return env.DEEPSEEK_MODEL;
}

export function isLlmEnabled(): boolean {
  const env = getEnv();
  return Boolean(env.DEEPSEEK_API_KEY);
}
