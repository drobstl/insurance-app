/**
 * Environment Variable Validation
 * 
 * This module validates that all required environment variables are set.
 * Import and call validateEnv() at application startup to catch
 * configuration issues early.
 */

interface EnvConfig {
  // Stripe
  STRIPE_SECRET_KEY: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_PRICE_ID_MONTHLY: string;
  STRIPE_PRICE_ID_ANNUAL: string;
  STRIPE_WEBHOOK_SECRET: string;
  
  // App
  NEXT_PUBLIC_APP_URL: string;
}

const requiredServerEnvVars: (keyof EnvConfig)[] = [
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_ID_MONTHLY',
  'STRIPE_PRICE_ID_ANNUAL',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_APP_URL',
];

const requiredClientEnvVars: (keyof EnvConfig)[] = [
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_APP_URL',
];

export function validateServerEnv(): void {
  const missing: string[] = [];
  
  for (const envVar of requiredServerEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach((v) => console.error(`   - ${v}`));
    console.error('');
    console.error('Please add these to your Vercel environment variables:');
    console.error('https://vercel.com/your-project/settings/environment-variables');
    
    // In production, log but don't crash to allow health check to report issues
    if (process.env.NODE_ENV === 'development') {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
  } else {
    console.log('✅ All required server environment variables are set');
  }
}

export function validateClientEnv(): void {
  const missing: string[] = [];
  
  for (const envVar of requiredClientEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  if (missing.length > 0) {
    console.warn('⚠️ Missing client environment variables:', missing.join(', '));
  }
}

export function getEnvVar(key: keyof EnvConfig): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

// Safe getters that return empty string instead of throwing
export function getEnvVarSafe(key: keyof EnvConfig): string {
  return process.env[key] || '';
}
