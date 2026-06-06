import { z } from 'zod';

const booleanFromString = z.preprocess((v) => v === 'true', z.boolean());

const EnvSchema = z.object({
  PHOENIX_API_URL: z.string().min(1),
  PHOENIX_API_TOKEN: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  LLM_PROVIDER: z.string().default('openai'),
  LLM_MODEL: z.string().default('gpt-4o'),
  SSH_KEY_PATH: z.string().default('/keys/id_rsa'),
  MOCK_MODE: booleanFromString.default(false),
  MOCK_PHOENIX: booleanFromString.default(false),
  MOCK_SSH: booleanFromString.default(false),
  MOCK_LLM: booleanFromString.default(false),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>): EnvConfig {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues
      .filter((i) => i.code === 'invalid_type' && i.received === 'undefined')
      .map((i) => i.path.join('.'));
    const firstMissing = missing[0] ?? result.error.issues[0]?.path.join('.');
    throw new Error(`Missing required env var: ${firstMissing}`);
  }
  return result.data;
}

let cachedEnv: EnvConfig | undefined;

// Lazily parse process.env on first access so importing this module has no
// side effects — pure helpers (parseEnv/resolveClientMode/isMockMode) and the
// test suite can run without a fully populated environment. Fails fast with a
// readable message the first time the real config is actually needed.
export function getEnv(): EnvConfig {
  if (cachedEnv) return cachedEnv;
  try {
    cachedEnv = parseEnv(process.env as Record<string, string | undefined>);
    return cachedEnv;
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

export function resolveClientMode(
  service: 'phoenix' | 'ssh' | 'llm',
  config: EnvConfig = getEnv(),
): 'mock' | 'real' {
  if (config.MOCK_MODE) return 'mock';
  if (service === 'phoenix' && config.MOCK_PHOENIX) return 'mock';
  if (service === 'ssh' && config.MOCK_SSH) return 'mock';
  if (service === 'llm' && config.MOCK_LLM) return 'mock';
  return 'real';
}

export function isMockMode(config: EnvConfig = getEnv()): boolean {
  return (
    config.MOCK_MODE ||
    config.MOCK_PHOENIX ||
    config.MOCK_SSH ||
    config.MOCK_LLM
  );
}
