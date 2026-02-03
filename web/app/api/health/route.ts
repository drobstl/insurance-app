import { NextResponse } from 'next/server';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../../../firebase';

/**
 * Health Check API Endpoint
 * 
 * Use this to monitor if your critical services are working:
 * - Firebase Firestore connectivity
 * - Stripe configuration
 * - Environment variables
 * 
 * Set up monitoring with services like:
 * - UptimeRobot (free): https://uptimerobot.com
 * - Better Uptime: https://betteruptime.com
 * 
 * Point the monitor to: https://agentforlife.app/api/health
 * Alert if response is not 200 or if "status" is not "healthy"
 */

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    firebase: { status: 'ok' | 'error'; message?: string };
    stripe: { status: 'ok' | 'error'; message?: string };
    environment: { status: 'ok' | 'error'; missing?: string[] };
  };
}

export async function GET() {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      firebase: { status: 'ok' },
      stripe: { status: 'ok' },
      environment: { status: 'ok' },
    },
  };

  // Check required environment variables
  const requiredEnvVars = [
    'STRIPE_SECRET_KEY',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_PRICE_ID_MONTHLY',
    'STRIPE_PRICE_ID_ANNUAL',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_APP_URL',
  ];

  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    health.services.environment = {
      status: 'error',
      missing: missingEnvVars,
    };
    health.status = 'degraded';
  }

  // Check Firebase connectivity
  try {
    const agentsRef = collection(db, 'agents');
    const testQuery = query(agentsRef, limit(1));
    await getDocs(testQuery);
    health.services.firebase = { status: 'ok' };
  } catch (error) {
    health.services.firebase = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Firebase connection failed',
    };
    health.status = 'unhealthy';
  }

  // Check Stripe configuration
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new Error('Stripe secret key not configured');
    }
    if (!stripeKey.startsWith('sk_')) {
      throw new Error('Invalid Stripe secret key format');
    }
    health.services.stripe = { status: 'ok' };
  } catch (error) {
    health.services.stripe = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Stripe configuration error',
    };
    health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}
