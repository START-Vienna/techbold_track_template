import { z } from 'zod';

// Tolerant boolean coercion: accept the common truthy strings, not just the
// literal 'true' (so MOCK_MODE=1/yes/on don't silently become false).
const booleanFromString = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase());
  return false;
}, z.boolean());

// Canonical names match the track contract (README / phoenix-openapi.yaml /
// docs): PHOENIX_API_BASE_URL, SSH_PRIVATE_KEY_PATH, SSH_USERNAME.
// Credentials default to '' and are required CONDITIONALLY (see superRefine) so
// the stack boots fully offline under MOCK_MODE without real keys (PLAT-04).
const EnvSchema = z
  .object({
    PHOENIX_API_BASE_URL: z.string().default(''),
    PHOENIX_API_TOKEN: z.string().default(''),
    OPENAI_API_KEY: z.string().default(''),
    LLM_PROVIDER: z.string().default('openai'),
    LLM_MODEL: z.string().default('gpt-4o'),
    SSH_PRIVATE_KEY_PATH: z.string().default('/keys/your-key.pem'),
    SSH_USERNAME: z.string().default('azureuser'),
    PORT: z.coerce.number().int().positive().default(8000),
    MOCK_MODE: booleanFromString.default(false),
    MOCK_PHOENIX: booleanFromString.default(false),
    MOCK_SSH: booleanFromString.default(false),
    MOCK_LLM: booleanFromString.default(false),
  })
  .superRefine((cfg, ctx) => {
    const requireVar = (needed: boolean, key: string, value: string) => {
      if (needed && value.trim() === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required` });
      }
    };
    const phoenixReal = !cfg.MOCK_MODE && !cfg.MOCK_PHOENIX;
    const llmReal = !cfg.MOCK_MODE && !cfg.MOCK_LLM;
    requireVar(phoenixReal, 'PHOENIX_API_BASE_URL', cfg.PHOENIX_API_BASE_URL);
    requireVar(phoenixReal, 'PHOENIX_API_TOKEN', cfg.PHOENIX_API_TOKEN);
    requireVar(llmReal, 'OPENAI_API_KEY', cfg.OPENAI_API_KEY);
  });

export type EnvConfig = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>): EnvConfig {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    // Message contains the variable NAME only — never the value — so secrets
    // can't leak into logs/error output.
    const key = result.error.issues[0]?.path.join('.') ?? 'unknown';
    throw new Error(`Missing or invalid required env var: ${key}`);
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
  return config.MOCK_MODE || config.MOCK_PHOENIX || config.MOCK_SSH || config.MOCK_LLM;
}
