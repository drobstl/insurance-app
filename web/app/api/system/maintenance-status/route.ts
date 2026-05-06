import 'server-only';

import { NextResponse } from 'next/server';

import {
  isMaintenanceModeReadOnly,
  MAINTENANCE_BANNER_MESSAGE,
  MAINTENANCE_RELAUNCH_LABEL,
} from '../../../../lib/maintenance-mode';

/**
 * GET /api/system/maintenance-status
 *
 * Public read-only endpoint the dashboard polls on mount to decide
 * whether to render the maintenance banner. Always exempt from the
 * middleware mutation block (see web/lib/maintenance-mode.ts >
 * MAINTENANCE_ALLOWLIST).
 *
 * Cached at the edge for 30s — the banner state changes only when
 * an env var flips, which requires a redeploy, which busts cache
 * naturally. 30s edge cache spares the function a per-page-load hit.
 */
export const dynamic = 'force-static';
export const revalidate = 30;

export async function GET() {
  return NextResponse.json(
    {
      readOnly: isMaintenanceModeReadOnly(),
      message: MAINTENANCE_BANNER_MESSAGE,
      relaunchLabel: MAINTENANCE_RELAUNCH_LABEL,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    },
  );
}
