/**
 * Cloud Billing API Client
 *
 * Layer-2 true-up for the local token cost ledger (Phase 3). Calls the
 * Google Cloud Billing API directly via fetch to retrieve authoritative
 * project billing metadata and spend.
 *
 * REQUIRED OAUTH SCOPE:
 *   https://www.googleapis.com/auth/cloud-billing.readonly
 *
 * Consumers of this module (e.g. src/lib/oauth-handler.ts) MUST request
 * this scope when initiating the Google OAuth flow, otherwise the API
 * calls here will return a 403.
 *
 * All functions return a discriminated `CloudBillingResult<T>` envelope —
 * network errors and non-2xx responses are caught and surfaced as
 * `{ ok: false, error }`. No exceptions bubble out.
 */

const CLOUD_BILLING_BASE_URL = 'https://cloudbilling.googleapis.com/v1';

export type BillingInfo = {
  name: string;
  projectId: string;
  billingAccountName: string | null;
  billingEnabled: boolean;
};

export type DailySpend = {
  date: string; // YYYY-MM-DD
  costUsd: number;
  currency: string;
};

export type CloudBillingResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Narrow an unknown error into a human-readable message.
 */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown cloud billing error';
}

/**
 * Extract a useful error string from a non-2xx fetch Response. Best-effort
 * — falls back to status text when the body is not JSON.
 */
async function extractResponseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; status?: string };
    };
    if (body?.error?.message) {
      return `${response.status} ${body.error.message}`;
    }
  } catch {
    // Body was not JSON — fall through to text.
  }
  return `${response.status} ${response.statusText || 'Request failed'}`;
}

/**
 * Fetch project billing metadata (whether billing is enabled and which
 * billing account the project is linked to).
 *
 * GET https://cloudbilling.googleapis.com/v1/projects/{projectId}/billingInfo
 */
export async function fetchProjectBillingInfo(
  projectId: string,
  accessToken: string
): Promise<CloudBillingResult<BillingInfo>> {
  if (!projectId) {
    return { ok: false, error: 'projectId is required' };
  }
  if (!accessToken) {
    return { ok: false, error: 'accessToken is required' };
  }

  const url = `${CLOUD_BILLING_BASE_URL}/projects/${encodeURIComponent(
    projectId
  )}/billingInfo`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return { ok: false, error: await extractResponseError(response) };
    }

    const raw = (await response.json()) as {
      name?: string;
      projectId?: string;
      billingAccountName?: string;
      billingEnabled?: boolean;
    };

    const data: BillingInfo = {
      name: raw.name ?? '',
      projectId: raw.projectId ?? projectId,
      billingAccountName: raw.billingAccountName ? raw.billingAccountName : null,
      billingEnabled: raw.billingEnabled === true,
    };

    return { ok: true, data };
  } catch (error: unknown) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/**
 * Fetch actual daily spend for a project over the last `days` days.
 *
 * STATUS: STUB (intentional).
 *
 * The Google Cloud Billing API does NOT expose itemized spend through a
 * simple REST endpoint. The two supported paths are:
 *
 *   1. BigQuery billing export — enable billing export to a BigQuery
 *      dataset, then query `gcp_billing_export_v1_*` tables via the
 *      BigQuery API. This requires an extra scope
 *      (`https://www.googleapis.com/auth/bigquery.readonly`) and the user
 *      must have configured export ahead of time.
 *
 *   2. Cloud Billing Budgets / Reports APIs — these are currently limited
 *      to budget metadata, not line-item spend.
 *
 * Until the BigQuery path is wired in, this function returns a clean,
 * typed error so the UI can surface "true-up unavailable, using local
 * ledger" without crashing. Callers should fall back to the local token
 * cost ledger (Phase 3 Layer-1).
 *
 * TODO(phase3-layer2): Implement BigQuery export query. Rough shape:
 *   const sql = `SELECT DATE(usage_start_time) AS date,
 *                       SUM(cost) AS cost_usd,
 *                       currency
 *                FROM \`PROJECT.DATASET.gcp_billing_export_v1_*\`
 *                WHERE project.id = @projectId
 *                  AND _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(),
 *                                                      INTERVAL @days DAY)
 *                GROUP BY date, currency
 *                ORDER BY date DESC`;
 *   Then POST to https://bigquery.googleapis.com/bigquery/v2/projects/{projectId}/queries
 */
export async function fetchActualSpend(
  projectId: string,
  accessToken: string,
  days: number
): Promise<CloudBillingResult<DailySpend[]>> {
  // Touch parameters so TypeScript does not flag them as unused while the
  // real implementation is pending. These values will be consumed once the
  // BigQuery path is wired in (see TODO above).
  void projectId;
  void accessToken;
  void days;

  return {
    ok: false,
    error:
      'Cloud Billing Reports API not yet implemented; use BigQuery export or local token ledger',
  };
}
