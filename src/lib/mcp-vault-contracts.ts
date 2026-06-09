export type McpVaultISODate = string;

export const MCP_VAULT_CONTRACT_VERSION = '1.0.0-contract-only';

export const MCP_VAULT_PROXY_ENDPOINTS = {
  resolve: '/mcp-secrets/v1/resolve',
  probe: '/mcp-secrets/v1/probe',
  lifecycle: '/mcp-secrets/v1/lifecycle',
  auditQuery: '/mcp-secrets/v1/audit/query',
} as const;

export type McpVaultBindingScope = 'runtime' | 'tool-bootstrap' | 'import-export' | 'rotation' | 'revoke' | 'evidence';

export type VaultRootStatus = 'active' | 'sealed' | 'quarantined' | 'retired';

export interface VaultRoot {
  vaultRootId: string;
  contractVersion: typeof MCP_VAULT_CONTRACT_VERSION;
  ownerId: string;
  projectHint?: string;
  status: VaultRootStatus;
  createdAt: McpVaultISODate;
  updatedAt: McpVaultISODate;
  policy: VaultPolicyEnvelope;
  auditSink: string;
  createdBy: 'system' | 'operator';
  allowDynamicServerRegistration: boolean;
  requireLocalhostOnlyProxy: true;
}

export type SecretRecordStatus = 'active' | 'quarantined' | 'revoked' | 'expired' | 'pending_rotation';

export type SecretMaterialKind =
  | 'access_token'
  | 'refresh_token'
  | 'id_token'
  | 'api_key'
  | 'oauth_client_secret'
  | 'private_key'
  | 'generic_token'
  | 'other';

export type SecretImportSource = 'env' | 'keychain' | 'mcp-config' | 'manual';

export interface SecretScopeBinding {
  serverId: string;
  toolIds: string[];
  maxOperations: 'per_call' | 'per_session' | 'bounded_batch';
  purpose?: McpVaultBindingScope;
  allowedFields?: ('access_token' | 'refresh_token' | 'id_token' | 'expires_at' | 'scope')[ ];
}

export interface SecretRecord {
  secretId: string;
  vaultRootId: string;
  kind: SecretMaterialKind;
  displayName: string;
  status: SecretRecordStatus;
  owner: 'user' | 'agent';
  labels: string[];
  scopedBindings: SecretScopeBinding[];
  source: SecretImportSource;
  versionId: string;
  rotationPolicy: SecretRotationPolicy;
  importSourceDetails: ImportSourceMetadata;
  createdAt: McpVaultISODate;
  updatedAt: McpVaultISODate;
  lastAccessedAt?: McpVaultISODate;
  aadPolicyHash: string;
}

export interface SecretVersion {
  versionId: string;
  secretId: string;
  secretMaterialType: SecretMaterialKind;
  sealedBlobUri: string;
  createdAt: McpVaultISODate;
  createdBy: 'import' | 'rotation' | 'migration' | 'manual';
  expiresAt?: McpVaultISODate;
  ciphertextHash: string;
  nonce: string;
  aad: string;
  isPrimary: boolean;
}

export interface McpSecretRef {
  vaultRootId: string;
  secretId: string;
  versionId?: string;
  serverId: string;
  toolId: string;
  purpose: McpVaultBindingScope;
  audience?: string;
  asString: string;
}

export interface VaultPolicyEnvelope {
  allowlistServerTool: boolean;
  denyOnMissingBinding: true;
  requireUserConsentFor: {
    serverIds: string[];
    toolIds: string[];
  };
  maxFieldRelease: number;
  rotateOnPolicyViolation: true;
}

export type PolicyDecisionState =
  | 'allow'
  | 'deny'
  | 'quarantine'
  | 'require_user_consent'
  | 'require_admin_override';

export type PolicyDecisionPoint =
  | 'transport_localhost'
  | 'vault_key_available'
  | 'secret_binding'
  | 'secret_scope'
  | 'tool_scope'
  | 'purpose'
  | 'rate_and_replay'
  | 'policy_override';

export interface VaultPolicyContext {
  requestId: string;
  vaultRootId: string;
  serverId: string;
  toolId: string;
  secretRef: string;
  purpose: McpVaultBindingScope;
  actor: McpActor;
  proxyUrl?: string;
}

export interface VaultPolicyDecision {
  requestId: string;
  point: PolicyDecisionPoint;
  result: PolicyDecisionState;
  reason: string;
  timestamp: McpVaultISODate;
  decisionAt: McpVaultISODate;
}

export interface McpActor {
  actorType: 'agent' | 'mcpdock' | 'system';
  actorId: string;
  clientFingerprint: string;
}

export interface McpVaultProxyResolveRequest {
  requestId: string;
  issuedAt: McpVaultISODate;
  ttlSeconds: number;
  vaultRootId: string;
  serverId: string;
  toolId: string;
  secretRefs: string[];
  purpose: 'runtime' | 'tool-bootstrap' | 'import-export';
  caller: McpActor;
  proxyUrl: string;
  releasePolicy: {
    minimumFields: ('access_token' | 'refresh_token' | 'id_token' | 'expires_at')[];
    allowRawValuesInProcess: false;
    maxFieldsPerSecret: number;
  };
}

export interface McpVaultProxyResolveResponse {
  requestId: string;
  status: 'ok' | 'partial' | 'denied' | 'error';
  issuedAt: McpVaultISODate;
  expiresAt: McpVaultISODate;
  evidenceId: string;
  release: Array<{
    secretRef: string;
    releasedFields: string[];
    expiresAt: McpVaultISODate;
  }>;
  denied: Array<{
    secretRef: string;
    reason: string;
  }>;
  policyDecisions: VaultPolicyDecision[];
}

export interface McpVaultProxyProbeRequest {
  requestId: string;
  issuedAt: McpVaultISODate;
  vaultRootId: string;
  serverId: string;
  toolId: string;
  secretRefs: string[];
  proxyUrl: string;
  caller: McpActor;
}

export interface McpVaultProxyProbeResponse {
  requestId: string;
  status: 'ok' | 'warn' | 'error';
  issuedAt: McpVaultISODate;
  findings: Array<{
    secretRef: string;
    bound: boolean;
    serverMatches: boolean;
    toolMatches: boolean;
    expiresSoon?: boolean;
  }>;
  policyDecisions: VaultPolicyDecision[];
}

export type VaultLifecycleAction =
  | 'rotation-queued'
  | 'rotation-started'
  | 'rotation-complete'
  | 'revoke-requested'
  | 'revoke-complete'
  | 'export-requested'
  | 'import-requested';

export interface McpVaultProxyLifecycleRequest {
  requestId: string;
  issuedAt: McpVaultISODate;
  action: VaultLifecycleAction;
  vaultRootId: string;
  actor: McpActor;
  target?: {
    secretId?: string;
    serverId?: string;
    toolId?: string;
  };
  details: Record<string, unknown>;
  proxyUrl: string;
}

export interface McpVaultProxyLifecycleResponse {
  requestId: string;
  status: 'accepted' | 'rejected' | 'queued';
  issuedAt: McpVaultISODate;
  action: VaultLifecycleAction;
  jobId?: string;
  evidenceId: string;
  message: string;
}

export interface SecretRotationPolicy {
  rotationEveryDays: number;
  overlapWindowMinutes: number;
  requiresReauth: boolean;
}

export type ImportWorkflowStatus =
  | 'idle'
  | 'discovering'
  | 'awaiting_approval'
  | 'approved'
  | 'blocked'
  | 'complete';

export interface ImportWorkflowState {
  state: ImportWorkflowStatus;
  vaultRootId: string;
  sources: SecretImportSource[];
  discoveredCount: number;
  approvedCount: number;
  blockedCount: number;
  updatedAt: McpVaultISODate;
  actor: McpActor;
}

export type ExportWorkflowStatus =
  | 'idle'
  | 'preparing'
  | 'awaiting_approval'
  | 'exporting'
  | 'complete'
  | 'failed';

export interface ExportWorkflowState {
  state: ExportWorkflowStatus;
  vaultRootId: string;
  encryptionEnabled: true;
  encryptedPackagePathHint?: string;
  requiresReconfirm: boolean;
  createdAt: McpVaultISODate;
  completedAt?: McpVaultISODate;
  actor: McpActor;
}

export type RotationWorkflowStatus =
  | 'scheduled'
  | 'running'
  | 'staged_complete'
  | 'finalized'
  | 'failed';

export interface RotationWorkflowState {
  state: RotationWorkflowStatus;
  vaultRootId: string;
  secretId: string;
  oldVersionId: string;
  nextVersionId?: string;
  overlapStartAt: McpVaultISODate;
  overlapEndAt?: McpVaultISODate;
  actor: McpActor;
}

export type RevokeWorkflowScope = 'secret' | 'tool' | 'server' | 'vault-root' | 'global';

export type RevokeWorkflowStatus = 'requested' | 'in_progress' | 'applied' | 'failed';

export interface RevokeWorkflowState {
  state: RevokeWorkflowStatus;
  vaultRootId: string;
  targetScope: RevokeWorkflowScope;
  secretId?: string;
  serverId?: string;
  toolId?: string;
  global?: boolean;
  reason: string;
  initiatedAt: McpVaultISODate;
  appliedAt?: McpVaultISODate;
  actor: McpActor;
}

export interface VaultImportState {
  workflow: ImportWorkflowState;
  items: Array<{
    ref: string;
    source: SecretImportSource;
    status: 'discovered' | 'quarantined' | 'rejected' | 'approved';
  }>;
}

export interface VaultExportState {
  workflow: ExportWorkflowState;
  destination: 'local_file' | 'removable_media' | 'cloud_container';
  includesRefreshTokenMaterial: boolean;
}

export interface VaultRotationState {
  workflow: RotationWorkflowState;
  activeVersionId: string;
  nextVersionId?: string;
  dualReadWindowMinutes: number;
}

export interface VaultRevokeState {
  workflow: RevokeWorkflowState;
  blastRadius: RevokeWorkflowScope;
}

export interface VaultWorkflowCoordinator {
  import: VaultImportState;
  export: VaultExportState;
  rotation: VaultRotationState;
  revoke: VaultRevokeState;
}

export interface McpVaultAuditLedgerEntry {
  evidenceId: string;
  requestId: string;
  timestamp: McpVaultISODate;
  actor: McpActor;
  vaultRootId: string;
  serverId: string;
  toolId: string;
  secretRef: string;
  decision: VaultPolicyDecisionDecision;
  policyVersion: string;
  fieldCount: number;
  wasRedacted: true;
  traceId: string;
  clientFingerprintHash: string;
  secretExposureFlags: string[];
  redactionProfile: 'strict';
  metadata?: Record<string, string | number | boolean | null>;
}

export type VaultPolicyDecisionDecision = 'allowed' | 'denied' | 'requires_consent' | 'denied_expired' | 'denied_scope_mismatch';

export interface ImportSourceMetadata {
  source: SecretImportSource;
  importTraceId: string;
  importReference: string;
}

export interface VaultValidationFailure {
  path: string;
  reason: string;
}

export interface VaultValidationSuccess<T> {
  ok: true;
  value: T;
  errors: [];
}

export interface VaultValidationError {
  ok: false;
  errors: VaultValidationFailure[];
  value?: never;
}

export type VaultValidationResult<T> = VaultValidationSuccess<T> | VaultValidationError;

export type VaultMasterKeyConfig =
  | {
      source: 'gemini-vault';
      failClosedIfUnavailable: true;
      allowDeterministicFallback: false;
      localKeyId: string;
    }
  | {
      source: 'keychain';
      failClosedIfUnavailable: false;
      keychainRef: string;
    }
  | {
      source: 'env';
      failClosedIfUnavailable: false;
      envVar: string;
    }
  | {
      source: 'deterministic-fallback';
      failClosedIfUnavailable: false;
      fallbackConfig: string;
    };

export interface VaultAuthorityConfig {
  vaultRootId: string;
  masterKey: VaultMasterKeyConfig;
}

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function validationOk<T>(value: T): VaultValidationSuccess<T> {
  return { ok: true, value, errors: [] };
}

function validationError<T>(errors: VaultValidationFailure[]): VaultValidationError {
  return { ok: false, errors };
}

export function parseMcpSecretRef(ref: string): VaultValidationResult<McpSecretRef> {
  try {
    const normalized = new URL(ref);
    if (normalized.protocol !== 'mcp-secret:') {
      return validationError([{ path: 'ref', reason: 'Must use mcp-secret scheme.' }]);
    }

    const path = normalized.pathname.replace(/^\//, '');
    if (!path) {
      return validationError([{ path: 'pathname', reason: 'Missing secret path segment.' }]);
    }

    const [secretId, versionFromPath] = path.split('@', 2);
    if (!secretId || path.includes('/')) {
      return validationError([{ path: 'pathname', reason: 'Expected /<secretId>@<versionId> format.' }]);
    }

    const query = Object.fromEntries(normalized.searchParams.entries());
    const versionFromQuery = query.version;

    return validationOk({
      vaultRootId: normalized.host,
      secretId,
      versionId: versionFromPath || versionFromQuery || undefined,
      serverId: query.server || '',
      toolId: query.tool || '',
      purpose: (query.purpose as McpVaultBindingScope) || 'runtime',
      audience: query.aud,
      asString: ref,
    });
  } catch {
    return validationError([{ path: 'ref', reason: 'Invalid MCP secret reference URI.' }]);
  }
}

export function validateLocalhostProxyUrl(url: string): VaultValidationResult<URL> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return validationError([{ path: 'proxyUrl', reason: 'Proxy URL must be http or https.' }]);
    }

    if (!LOCALHOST_HOSTS.has(parsed.hostname.toLowerCase())) {
      return validationError([
        {
          path: 'proxyUrl',
          reason: `Proxy URL must target localhost. Received ${parsed.hostname}.`,
        },
      ]);
    }

    return validationOk(parsed);
  } catch {
    return validationError([{ path: 'proxyUrl', reason: 'Proxy URL must be a valid URL.' }]);
  }
}

export function validateSecretBindings(bindings: SecretScopeBinding[]): VaultValidationResult<SecretScopeBinding[]> {
  const errors: VaultValidationFailure[] = [];

  if (!Array.isArray(bindings) || bindings.length === 0) {
    return validationError([{ path: 'scopedBindings', reason: 'At least one server/tool binding is required.' }]);
  }

  bindings.forEach((binding, index) => {
    const path = `scopedBindings[${index}]`;
    if (!binding || typeof binding.serverId !== 'string' || binding.serverId.trim() === '') {
      errors.push({ path: `${path}.serverId`, reason: 'Binding requires a serverId.' });
    }

    if (!Array.isArray(binding.toolIds) || binding.toolIds.length === 0) {
      errors.push({ path: `${path}.toolIds`, reason: 'Binding requires at least one toolId.' });
    } else if (binding.toolIds.some((toolId) => typeof toolId !== 'string' || toolId.trim() === '')) {
      errors.push({ path: `${path}.toolIds`, reason: 'toolIds must be non-empty strings.' });
    }
  });

  if (errors.length > 0) {
    return validationError(errors);
  }

  return validationOk(bindings);
}

const FORBIDDEN_AUDIT_KEYS = new Set([
  'rawSecret',
  'raw_secret',
  'secret',
  'secretValue',
  'secret_value',
  'apiKey',
  'api_key',
  'clientSecret',
  'client_secret',
  'refreshToken',
  'refresh_token',
  'accessToken',
  'access_token',
  'tokenValue',
]);

function collectForbiddenAuditKeys(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectForbiddenAuditKeys(item, `${path}[${index}]`));
  }

  const obj = value as Record<string, unknown>;
  return Object.entries(obj).flatMap(([key, nested]) => {
    const currentPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_AUDIT_KEYS.has(key)) {
      return [currentPath];
    }
    return collectForbiddenAuditKeys(nested, currentPath);
  });
}

export function validateAuditLedgerEntry(entry: McpVaultAuditLedgerEntry): VaultValidationResult<McpVaultAuditLedgerEntry> {
  const forbiddenPaths = collectForbiddenAuditKeys(entry);
  if (forbiddenPaths.length > 0) {
    return validationError([
      {
        path: 'entry',
        reason: `Raw secret fields are forbidden in audit entries: ${forbiddenPaths.join(', ')}`,
      },
    ]);
  }

  if (!entry.wasRedacted || entry.redactionProfile !== 'strict') {
    return validationError([
      {
        path: 'redactionProfile',
        reason: 'Audit entries must set wasRedacted=true and redactionProfile="strict".',
      },
    ]);
  }

  if (entry.fieldCount < 0) {
    return validationError([{ path: 'fieldCount', reason: 'fieldCount cannot be negative.' }]);
  }

  return validationOk(entry);
}

export function validateVaultAuthorityConfig(config: VaultAuthorityConfig): VaultValidationResult<VaultAuthorityConfig> {
  const normalized: VaultValidationFailure[] = [];

  if (config.masterKey.source !== 'gemini-vault') {
    return validationError([
      {
        path: 'masterKey.source',
        reason: 'Vault master key source must be gemini-vault. Keychain and env are import-only sources.',
      },
    ]);
  }

  if (config.masterKey.failClosedIfUnavailable !== true) {
    normalized.push({
      path: 'masterKey.failClosedIfUnavailable',
      reason: 'Vault master key must fail closed when unavailable.',
    });
  }

  if (config.masterKey.allowDeterministicFallback !== false) {
    normalized.push({
      path: 'masterKey.allowDeterministicFallback',
      reason: 'Deterministic key fallback configuration is forbidden.',
    });
  }

  if (normalized.length > 0) {
    return validationError(normalized);
  }

  return validationOk(config);
}

export function validateSecretRecord(record: SecretRecord): VaultValidationResult<SecretRecord> {
  const bindingValidation = validateSecretBindings(record.scopedBindings);
  if (!bindingValidation.ok) {
    return validationError(bindingValidation.errors);
  }

  if (record.status !== 'active' && record.status !== 'quarantined' && record.status !== 'revoked' && record.status !== 'expired' && record.status !== 'pending_rotation') {
    return validationError([{ path: 'status', reason: 'Unsupported SecretRecord status.' }]);
  }

  return validationOk(record);
}
