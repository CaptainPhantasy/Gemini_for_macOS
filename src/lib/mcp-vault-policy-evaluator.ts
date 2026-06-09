import {
  McpActor,
  McpVaultBindingScope,
  McpVaultProxyProbeRequest,
  McpVaultProxyResolveRequest,
  PolicyDecisionPoint,
  PolicyDecisionState,
  SecretRecord,
  validateAuditLedgerEntry,
  validateLocalhostProxyUrl,
  VaultPolicyDecision,
  VaultPolicyEnvelope,
  VaultValidationFailure,
  parseMcpSecretRef,
} from './mcp-vault-contracts';

export type McpVaultOperation = 'resolve' | 'probe';

export interface McpVaultPolicyEvaluatorContext {
  vaultRootId: string;
  vaultRootStatus: 'active' | 'sealed' | 'quarantined' | 'retired';
  secrets: SecretRecord[];
  policy: VaultPolicyEnvelope;
  requireLocalhostOnlyProxy: boolean;
  allowByDefault: false;
}

export interface McpVaultPolicyEvaluatorInput {
  requestId: string;
  proxyUrl: string;
  serverId: string;
  toolId: string;
  actor: McpActor;
  purpose: McpVaultBindingScope;
  operation: McpVaultOperation;
}

export interface McpVaultResolvePolicyInput extends McpVaultPolicyEvaluatorInput {
  request: McpVaultProxyResolveRequest;
}

export interface McpVaultProbePolicyInput extends McpVaultPolicyEvaluatorInput {
  request: McpVaultProxyProbeRequest;
}

export type McpVaultPolicyActorScope = 'none' | 'server-only' | 'tool-only' | 'server-tool';

export interface McpVaultPolicyResult {
  requestId: string;
  allowed: boolean;
  policyDecisions: VaultPolicyDecision[];
  deniedSecretRefs: string[];
  allowedSecretRefs: string[];
  actorScope: McpVaultPolicyActorScope;
  errors: string[];
}

export interface McpVaultPolicyEvaluator {
  evaluateResolve(input: McpVaultResolvePolicyInput): McpVaultPolicyResult;
  evaluateProbe(input: McpVaultProbePolicyInput): McpVaultPolicyResult;
}

const DENY = 'deny';

function nowIso(): string {
  return new Date().toISOString();
}

function makeDecision(
  requestId: string,
  point: PolicyDecisionPoint,
  result: PolicyDecisionState,
  reason: string,
): VaultPolicyDecision {
  const timestamp = nowIso();
  return {
    requestId,
    point,
    result,
    reason,
    timestamp,
    decisionAt: timestamp,
  };
}

function missingBindingReasons(
  record: SecretRecord,
  serverId: string,
  toolId: string,
): string[] {
  const reasons: string[] = [];
  const bindingMatch = record.scopedBindings.find((binding) => binding.serverId === serverId);
  if (!bindingMatch) {
    reasons.push('missing_server_binding');
    return reasons;
  }

  if (!bindingMatch.toolIds.includes(toolId)) {
    reasons.push('missing_tool_binding');
  }

  return reasons;
}

function failResult(requestId: string, reason: string, extra: VaultPolicyDecision[]): McpVaultPolicyResult {
  return {
    requestId,
    allowed: false,
    policyDecisions: extra,
    deniedSecretRefs: [],
    allowedSecretRefs: [],
    actorScope: 'none',
    errors: [reason],
  };
}

function evaluateSecretRefs(
  requestId: string,
  requestedRefs: string[],
  secrets: SecretRecord[],
  serverId: string,
  toolId: string,
  decisions: VaultPolicyDecision[],
): { allowed: string[]; denied: string[] } {
  const allowedSecretRefs: string[] = [];
  const deniedSecretRefs: string[] = [];

  requestedRefs.forEach((secretRef) => {
    const parsed = parseMcpSecretRef(secretRef);
    if (!parsed.ok) {
      decisions.push(makeDecision(requestId, 'secret_binding', DENY, 'invalid_secret_ref_format'));
      deniedSecretRefs.push(secretRef);
      return;
    }

    const matches = secrets.filter((secret) => secret.secretId === parsed.value.secretId);
    if (matches.length === 0) {
      decisions.push(makeDecision(requestId, 'secret_binding', DENY, 'secret_not_found'));
      deniedSecretRefs.push(secretRef);
      return;
    }

    const reasons = missingBindingReasons(matches[0], serverId, toolId);
    if (reasons.length > 0) {
      reasons.forEach((reason) => {
        decisions.push(makeDecision(requestId, 'tool_scope', DENY, reason));
      });
      deniedSecretRefs.push(secretRef);
      return;
    }

    allowedSecretRefs.push(secretRef);
    decisions.push(makeDecision(requestId, 'secret_scope', 'allow', 'secret_binding_satisfied'));
  });

  return { allowed: allowedSecretRefs, denied: deniedSecretRefs };
}

function evaluateScopeMatch(input: { serverId: string; toolId: string }, policy: VaultPolicyEnvelope): McpVaultPolicyActorScope {
  if (policy.requireUserConsentFor.serverIds.includes(input.serverId) && policy.requireUserConsentFor.toolIds.includes(input.toolId)) {
    return 'server-tool';
  }

  if (policy.requireUserConsentFor.serverIds.includes(input.serverId)) {
    return 'server-only';
  }

  if (policy.requireUserConsentFor.toolIds.includes(input.toolId)) {
    return 'tool-only';
  }

  return 'none';
}

function validateTransport(input: { proxyUrl: string; requestId: string; enforceLocalhostOnly: boolean }, decisions: VaultPolicyDecision[]): boolean {
  if (!input.enforceLocalhostOnly) {
    return true;
  }

  const localhost = validateLocalhostProxyUrl(input.proxyUrl);
  if (!localhost.ok) {
    decisions.push(makeDecision(input.requestId, 'transport_localhost', DENY, localhost.errors[0]?.reason || 'proxy_not_localhost'));
    return false;
  }

  decisions.push(makeDecision(input.requestId, 'transport_localhost', 'allow', 'local_proxy_check_passed'));
  return true;
}

function ensureVaultRootActive(input: { vaultRootStatus: string; requestId: string; decisions: VaultPolicyDecision[] }): boolean {
  if (input.vaultRootStatus !== 'active') {
    input.decisions.push(makeDecision(input.requestId, 'vault_key_available', DENY, 'vault_root_not_active'));
    return false;
  }

  input.decisions.push(makeDecision(input.requestId, 'vault_key_available', 'allow', 'vault_root_active'));
  return true;
}

function actorScopeRequiresConsent(scope: McpVaultPolicyActorScope): string[] {
  if (scope === 'server-tool') {
    return ['requires_user_consent'];
  }

  if (scope === 'server-only' || scope === 'tool-only') {
    return ['partial_consent_required'];
  }

  return [];
}

class BaseMcpVaultPolicyEvaluator {
  private readonly context: McpVaultPolicyEvaluatorContext;

  constructor(context: McpVaultPolicyEvaluatorContext) {
    this.context = context;
  }

  private evaluateBase(
    requestId: string,
    proxyUrl: string,
    serverId: string,
    toolId: string,
    requestedRefs: string[],
  ): McpVaultPolicyResult {
    const policyDecisions: VaultPolicyDecision[] = [];

    if (this.context.allowByDefault !== false) {
      return failResult(requestId, 'policy_not_configured_for_deny_by_default', [
        makeDecision(requestId, 'policy_override', DENY, 'context.must_set_allowByDefault_false'),
      ]);
    }

    if (!this.context.vaultRootId) {
      return failResult(requestId, 'vault_root_id_missing', [makeDecision(requestId, 'vault_key_available', DENY, 'vault_root_id_missing')]);
    }

    if (!validateTransport({ proxyUrl, requestId, enforceLocalhostOnly: this.context.requireLocalhostOnlyProxy }, policyDecisions)) {
      return {
        requestId,
        allowed: false,
        policyDecisions,
        deniedSecretRefs: requestedRefs,
        allowedSecretRefs: [],
        actorScope: 'none',
        errors: ['proxy_transport_denied'],
      };
    }

    if (!ensureVaultRootActive({ vaultRootStatus: this.context.vaultRootStatus, requestId, decisions: policyDecisions })) {
      return {
        requestId,
        allowed: false,
        policyDecisions,
        deniedSecretRefs: requestedRefs,
        allowedSecretRefs: [],
        actorScope: 'none',
        errors: ['vault_root_inactive'],
      };
    }

    const actorScope = evaluateScopeMatch({ serverId, toolId }, this.context.policy);
    const secretResolution = evaluateSecretRefs(requestId, requestedRefs, this.context.secrets, serverId, toolId, policyDecisions);
    const requiresConsent = actorScopeRequiresConsent(actorScope);

    const hasAnyDeny = secretResolution.denied.length > 0;
    if (hasAnyDeny) {
      policyDecisions.push(makeDecision(requestId, 'policy_override', DENY, 'one_or_more_secrets_denied'));
      return {
        requestId,
        allowed: false,
        policyDecisions,
        deniedSecretRefs: secretResolution.denied,
        allowedSecretRefs: secretResolution.allowed,
        actorScope,
        errors: ['access_control_denied'],
      };
    }

    if (requiresConsent.length > 0) {
      policyDecisions.push(makeDecision(requestId, 'policy_override', 'require_user_consent', 'subject_to_consent_policy'));
      return {
        requestId,
        allowed: false,
        policyDecisions,
        deniedSecretRefs: requestedRefs,
        allowedSecretRefs: [],
        actorScope,
        errors: requiresConsent,
      };
    }

    return {
      requestId,
      allowed: true,
      policyDecisions,
      deniedSecretRefs: [],
      allowedSecretRefs: secretResolution.allowed,
      actorScope,
      errors: [],
    };
  }

  evaluateResolve(input: McpVaultResolvePolicyInput): McpVaultPolicyResult {
    const { request, requestId, serverId, toolId, purpose, actor } = input;
    const decisionBase = this.evaluateBase(requestId, request.proxyUrl, serverId, toolId, request.secretRefs);

    if (!decisionBase.allowed) {
      return decisionBase;
    }

    decisionBase.policyDecisions.push(makeDecision(requestId, 'purpose', 'allow', `purpose:${purpose}`));
    decisionBase.policyDecisions.push(makeDecision(requestId, 'tool_scope', 'allow', `actor:${actor.actorType}`));
    return decisionBase;
  }

  evaluateProbe(input: McpVaultProbePolicyInput): McpVaultPolicyResult {
    const { requestId, request } = input;
    return this.evaluateBase(requestId, request.proxyUrl, input.serverId, input.toolId, request.secretRefs);
  }
}

export class DenyByDefaultMcpVaultPolicyEvaluator extends BaseMcpVaultPolicyEvaluator implements McpVaultPolicyEvaluator {
  constructor(context: Omit<McpVaultPolicyEvaluatorContext, 'allowByDefault'> & { allowByDefault?: false }) {
    super({ ...context, allowByDefault: false });
  }
}

export { validateAuditLedgerEntry };
export type { VaultPolicyEnvelope, VaultValidationFailure };
export type { VaultValidationFailure as McpVaultValidationFailure };
