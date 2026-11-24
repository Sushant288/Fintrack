import { z } from 'zod';

const envSchema = z.object({
  VITE_API_URL: z
    .string({ required_error: 'VITE_API_URL is required' })
    .url('VITE_API_URL must be a valid absolute URL')
    .transform((val) => val.replace(/\/+$/, ''))
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;
let envError: z.ZodError | null = null;

export function validateEnv(rawEnv: unknown = (import.meta as { env?: unknown }).env): {
  success: boolean;
  data?: Env;
  error?: z.ZodError;
} {
  const result = envSchema.safeParse(rawEnv);
  if (result.success) {
    cachedEnv = result.data;
    envError = null;
    return { success: true, data: result.data };
  } else {
    cachedEnv = null;
    envError = result.error;
    return { success: false, error: result.error };
  }
}

export function getEnvError(): z.ZodError | null {
  if (!cachedEnv && !envError) {
    validateEnv();
  }
  return envError;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: keyof Env) {
    if (!cachedEnv) {
      const res = validateEnv();
      if (!res.success || !res.data) {
        throw new Error(
          `Environment validation failed: ${res.error?.errors.map((e) => e.message).join(', ')}`
        );
      }
    }
    return (cachedEnv as Env)[prop];
  }
});
