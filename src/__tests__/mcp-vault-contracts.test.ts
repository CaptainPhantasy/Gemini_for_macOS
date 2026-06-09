import { describe, expect, it } from 'vitest';
import {
  McpVaultProxyLifecycleRequest,
  McpVaultProxyResolveRequest,
  VaultAuthorityConfig,
  McpActor,
  validateAuditLedgerEntry,
  validateLocalhostProxyUrl,
  validateSecretBindings,
  validateVaultAuthorityConfig,
  SecretRecord,
  VaultPolicyEnvelope,
} from '../lib/mcp-vault-contracts';
import { DenyByDefaultMcpVaultPolicyEvaluator } from '../lib/mcp-vault-policy-evaluator';

describe('MCP Vault contract validation', () => {
  it('rejects non-localhost proxy URLs', () => {
    const result = validateLocalhostProxyUrl('https://127.0.0.1:13001/mcp-secrets/v1/resolve');
    expect(result.ok).toBe(true);

    expect(validateLocalhostProxyUrl('https://example.com/mcp-secrets/v1/resolve').ok).toBe(false);
    expect(validateLocalhostProxyUrl('http://localhost:13001').ok).toBe(true);
  });

  it('rejects secret records missing server/tool binding', () => {
    const bindings: Parameters<typeof validateSecretBindings>[0] = [
      {
        serverId: '',
        toolIds: [],
        maxOperations: 'per_call' as const,
      },
      {
        serverId: 'server-ok',
        toolIds: [''],
        maxOperations: 'per_call' as const,
      },
    ];

    const result = validateSecretBindings(bindings);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0].path).toContain('serverId');
      expect(result.errors[1].path).toContain('toolIds');
      expect(result.errors[2].path).toContain('toolIds');
    }
  });

  it('rejects raw secret fields in audit entries', () => {
    const badEntry = {
      evidenceId: 'e1',
      requestId: 'r1',
      timestamp: '2026-05-31T00:00:00Z',
      actor: {
        actorType: 'agent',
        actorId: 'agent-1',
        clientFingerprint: 'fp',
      } as McpActor,
      vaultRootId: 'vr_1',
      serverId: 'drive',
      toolId: 'files.read',
      secretRef: 'mcp-secret://vr_1/se1@v1?server=drive&tool=files.read',
      decision: 'allowed',
      policyVersion: 'policy-1',
      fieldCount: 1,
      wasRedacted: true,
      traceId: 't1',
      clientFingerprintHash: 'c1',
      secretExposureFlags: [],
      redactionProfile: 'strict',
      rawSecret: 'should-be-rejected',
    } as unknown;

    expect(validateAuditLedgerEntry(badEntry as any).ok).toBe(false);
  });

  it('rejects deterministic key fallback configuration', () => {
    const cfg: VaultAuthorityConfig = {
      vaultRootId: 'vr_1',
      masterKey: {
        source: 'deterministic-fallback',
        failClosedIfUnavailable: false,
        fallbackConfig: 'not-allowed',
      },
    };

    expect(validateVaultAuthorityConfig(cfg).ok).toBe(false);
  });

  it('rejects keychain and .env as source-of-truth config', () => {
    expect(
      validateVaultAuthorityConfig({
        vaultRootId: 'vr_1',
        masterKey: {
          source: 'env',
          failClosedIfUnavailable: false,
          envVar: 'GEMINI_VAULT_KEY',
        },
      }).ok,
    ).toBe(false);

    expect(
      validateVaultAuthorityConfig({
        vaultRootId: 'vr_1',
        masterKey: {
          source: 'keychain',
          failClosedIfUnavailable: false,
          keychainRef: 'login/gemini',
        },
      }).ok,
    ).toBe(false);
  });

  it('accepts valid vault authority config with gemini-vault source and fail-closed behavior', () => {
    const valid: VaultAuthorityConfig = {
      vaultRootId: 'vr_1',
      masterKey: {
        source: 'gemini-vault',
        failClosedIfUnavailable: true,
        allowDeterministicFallback: false,
        localKeyId: 'mk-root',
      },
    };

    expect(validateVaultAuthorityConfig(valid).ok).toBe(true);
  });

  it('exposes typed request envelopes for compile-time checks', () => {
    const actor: McpActor = {
      actorType: 'agent',
      actorId: 'agent-1',
      clientFingerprint: 'fp-1',
    };

    const resolveRequest: McpVaultProxyResolveRequest = {
      requestId: 'req-1',
      issuedAt: '2026-05-31T00:00:00Z',
      ttlSeconds: 45,
      vaultRootId: 'vr_1',
      serverId: 'drive',
      toolId: 'files.read',
      secretRefs: ['mcp-secret://vr_1/se-1@v-1?server=drive&tool=files.read'],
      purpose: 'runtime',
      caller: actor,
      proxyUrl: 'http://127.0.0.1:13001/mcp-secrets/v1/resolve',
      releasePolicy: {
        minimumFields: ['access_token'],
        allowRawValuesInProcess: false,
        maxFieldsPerSecret: 1,
      },
    };

    const lifecycle: McpVaultProxyLifecycleRequest = {
      requestId: 'lreq-1',
      issuedAt: '2026-05-31T00:00:00Z',
      action: 'rotation-started',
      vaultRootId: 'vr_1',
      actor,
      target: {
        secretId: 'se-1',
      },
      details: { correlationId: 'x' },
      proxyUrl: 'http://127.0.0.1:13001/mcp-secrets/v1/lifecycle',
    };

    expect(resolveRequest.proxyUrl).toMatch(/^http:\/\/127.0.0.1/);
    expect(lifecycle.target?.secretId).toBe('se-1');
    expect(resolveRequest.secretRefs[0]).toContain('mcp-secret://');
    expect(resolveRequest.releasePolicy.maxFieldsPerSecret).toBeGreaterThan(0);
  });

  it('evaluates deny-by-default policy when proxy is non-localhost', () => {
    const evaluator = new DenyByDefaultMcpVaultPolicyEvaluator({
      vaultRootId: 'vr-1',
      vaultRootStatus: 'active',
      requireLocalhostOnlyProxy: true,
      secrets: [
        {
          secretId: 'se-1',
          vaultRootId: 'vr-1',
          kind: 'access_token',
          displayName: 'Drive runtime token',
          status: 'active',
          owner: 'user',
          labels: ['google', 'drive'],
          scopedBindings: [
            {
              serverId: 'drive',
              toolIds: ['files.read'],
              maxOperations: 'per_call',
            },
          ],
          source: 'manual',
          versionId: 'v-1',
          rotationPolicy: {
            rotationEveryDays: 90,
            overlapWindowMinutes: 15,
            requiresReauth: true,
          },
          importSourceDetails: {
            source: 'manual',
            importTraceId: 'import-1',
            importReference: 'ui-entry',
          },
          createdAt: '2026-05-31T00:00:00Z',
          updatedAt: '2026-05-31T00:00:00Z',
          aadPolicyHash: 'sha256:abc',
        } satisfies SecretRecord,
      ],
      policy: {
        allowlistServerTool: true,
        denyOnMissingBinding: true,
        requireUserConsentFor: {
          serverIds: ['drive'],
          toolIds: ['files.read'],
        },
        maxFieldRelease: 1,
        rotateOnPolicyViolation: true,
      } as VaultPolicyEnvelope,
    });

    const resolveRequest: McpVaultProxyResolveRequest = {
      requestId: 'denied-1',
      issuedAt: '2026-05-31T00:00:00Z',
      ttlSeconds: 30,
      vaultRootId: 'vr-1',
      serverId: 'drive',
      toolId: 'files.read',
      secretRefs: ['mcp-secret://vr-1/se-1@v-1?server=drive&tool=files.read'],
      purpose: 'runtime',
      caller: {
        actorType: 'agent',
        actorId: 'agent-1',
        clientFingerprint: 'fp',
      },
      proxyUrl: 'https://attacker.invalid/mcp-secrets/v1/resolve',
      releasePolicy: {
        minimumFields: ['access_token'],
        allowRawValuesInProcess: false,
        maxFieldsPerSecret: 1,
      },
    };

    const result = evaluator.evaluateResolve({
      request: resolveRequest,
      requestId: resolveRequest.requestId,
      proxyUrl: resolveRequest.proxyUrl,
      serverId: resolveRequest.serverId,
      toolId: resolveRequest.toolId,
      actor: resolveRequest.caller,
      purpose: resolveRequest.purpose,
      operation: 'resolve',
    });

    expect(result.allowed).toBe(false);
    expect(result.errors).toContain('proxy_transport_denied');
    expect(result.policyDecisions.some((decision) => decision.point === 'transport_localhost' && decision.result === 'deny')).toBe(true);
  });

  it('evaluates deny-by-default behavior when request is missing server/tool binding', () => {
    const evaluator = new DenyByDefaultMcpVaultPolicyEvaluator({
      vaultRootId: 'vr-2',
      vaultRootStatus: 'active',
      requireLocalhostOnlyProxy: true,
      secrets: [
        {
          secretId: 'se-2',
          vaultRootId: 'vr-2',
          kind: 'api_key',
          displayName: 'Unrelated tool token',
          status: 'active',
          owner: 'agent',
          labels: ['api'],
          scopedBindings: [
            {
              serverId: 'calendar',
              toolIds: ['events.list'],
              maxOperations: 'per_call',
            },
          ],
          source: 'manual',
          versionId: 'v-2',
          rotationPolicy: {
            rotationEveryDays: 60,
            overlapWindowMinutes: 10,
            requiresReauth: false,
          },
          importSourceDetails: {
            source: 'manual',
            importTraceId: 'import-2',
            importReference: 'ui-entry',
          },
          createdAt: '2026-05-31T00:00:00Z',
          updatedAt: '2026-05-31T00:00:00Z',
          aadPolicyHash: 'sha256:def',
        } satisfies SecretRecord,
      ],
      policy: {
        allowlistServerTool: true,
        denyOnMissingBinding: true,
        requireUserConsentFor: {
          serverIds: [],
          toolIds: [],
        },
        maxFieldRelease: 1,
        rotateOnPolicyViolation: true,
      } as VaultPolicyEnvelope,
    });

    const resolveRequest: McpVaultProxyResolveRequest = {
      requestId: 'denied-2',
      issuedAt: '2026-05-31T00:00:00Z',
      ttlSeconds: 30,
      vaultRootId: 'vr-2',
      serverId: 'drive',
      toolId: 'files.read',
      secretRefs: ['mcp-secret://vr-2/se-2@v-2?server=drive&tool=files.read'],
      purpose: 'runtime',
      caller: {
        actorType: 'agent',
        actorId: 'agent-1',
        clientFingerprint: 'fp',
      },
      proxyUrl: 'http://127.0.0.1:13001/mcp-secrets/v1/resolve',
      releasePolicy: {
        minimumFields: ['access_token'],
        allowRawValuesInProcess: false,
        maxFieldsPerSecret: 1,
      },
    };

    const result = evaluator.evaluateResolve({
      request: resolveRequest,
      requestId: resolveRequest.requestId,
      proxyUrl: 'http://127.0.0.1:13001/mcp-secrets/v1/resolve',
      serverId: resolveRequest.serverId,
      toolId: resolveRequest.toolId,
      actor: resolveRequest.caller,
      purpose: resolveRequest.purpose,
      operation: 'resolve',
    });

    expect(result.allowed).toBe(false);
    expect(result.allowedSecretRefs).toHaveLength(0);
    expect(result.deniedSecretRefs).toContain(resolveRequest.secretRefs[0]);
    expect(result.errors).toContain('access_control_denied');
    expect(result.policyDecisions.some((decision) => decision.point === 'policy_override' && decision.result === 'deny')).toBe(true);
  });


  it('requires consent instead of allowing matched bindings when policy requires it', () => {
    const evaluator = new DenyByDefaultMcpVaultPolicyEvaluator({
      vaultRootId: 'vr-consent',
      vaultRootStatus: 'active',
      requireLocalhostOnlyProxy: true,
      secrets: [
        {
          secretId: 'se-consent',
          vaultRootId: 'vr-consent',
          kind: 'access_token',
          displayName: 'Consent-gated token',
          status: 'active',
          owner: 'user',
          labels: ['google', 'drive'],
          scopedBindings: [
            {
              serverId: 'drive',
              toolIds: ['files.write'],
              maxOperations: 'per_call',
            },
          ],
          source: 'manual',
          versionId: 'v-consent',
          rotationPolicy: {
            rotationEveryDays: 90,
            overlapWindowMinutes: 10,
            requiresReauth: true,
          },
          importSourceDetails: {
            source: 'manual',
            importTraceId: 'import-consent',
            importReference: 'ui-entry',
          },
          createdAt: '2026-05-31T00:00:00Z',
          updatedAt: '2026-05-31T00:00:00Z',
          aadPolicyHash: 'sha256:consent',
        } satisfies SecretRecord,
      ],
      policy: {
        allowlistServerTool: true,
        denyOnMissingBinding: true,
        requireUserConsentFor: {
          serverIds: ['drive'],
          toolIds: ['files.write'],
        },
        maxFieldRelease: 1,
        rotateOnPolicyViolation: true,
      } as VaultPolicyEnvelope,
    });

    const resolveRequest: McpVaultProxyResolveRequest = {
      requestId: 'consent-1',
      issuedAt: '2026-05-31T00:00:00Z',
      ttlSeconds: 30,
      vaultRootId: 'vr-consent',
      serverId: 'drive',
      toolId: 'files.write',
      secretRefs: ['mcp-secret://vr-consent/se-consent@v-consent?server=drive&tool=files.write'],
      purpose: 'runtime',
      caller: {
        actorType: 'agent',
        actorId: 'agent-1',
        clientFingerprint: 'fp',
      },
      proxyUrl: 'http://127.0.0.1:13001/mcp-secrets/v1/resolve',
      releasePolicy: {
        minimumFields: ['access_token'],
        allowRawValuesInProcess: false,
        maxFieldsPerSecret: 1,
      },
    };

    const result = evaluator.evaluateResolve({
      request: resolveRequest,
      requestId: resolveRequest.requestId,
      proxyUrl: resolveRequest.proxyUrl,
      serverId: resolveRequest.serverId,
      toolId: resolveRequest.toolId,
      actor: resolveRequest.caller,
      purpose: resolveRequest.purpose,
      operation: 'resolve',
    });

    expect(result.allowed).toBe(false);
    expect(result.errors).toContain('requires_user_consent');
    expect(result.policyDecisions.some((decision) => decision.point === 'policy_override' && decision.result === 'require_user_consent')).toBe(true);
  });
  it('defaults to deny for unknown secret refs', () => {
    const evaluator = new DenyByDefaultMcpVaultPolicyEvaluator({
      vaultRootId: 'vr-3',
      vaultRootStatus: 'active',
      requireLocalhostOnlyProxy: true,
      secrets: [],
      policy: {
        allowlistServerTool: true,
        denyOnMissingBinding: true,
        requireUserConsentFor: {
          serverIds: [],
          toolIds: [],
        },
        maxFieldRelease: 1,
        rotateOnPolicyViolation: true,
      } as VaultPolicyEnvelope,
    });

    const resolveRequest: McpVaultProxyResolveRequest = {
      requestId: 'denied-3',
      issuedAt: '2026-05-31T00:00:00Z',
      ttlSeconds: 30,
      vaultRootId: 'vr-3',
      serverId: 'drive',
      toolId: 'files.read',
      secretRefs: ['mcp-secret://vr-3/missing@v-3?server=drive&tool=files.read'],
      purpose: 'runtime',
      caller: {
        actorType: 'agent',
        actorId: 'agent-1',
        clientFingerprint: 'fp',
      },
      proxyUrl: 'http://127.0.0.1:13001/mcp-secrets/v1/resolve',
      releasePolicy: {
        minimumFields: ['access_token'],
        allowRawValuesInProcess: false,
        maxFieldsPerSecret: 1,
      },
    };

    const result = evaluator.evaluateResolve({
      request: resolveRequest,
      requestId: resolveRequest.requestId,
      proxyUrl: resolveRequest.proxyUrl,
      serverId: resolveRequest.serverId,
      toolId: resolveRequest.toolId,
      actor: resolveRequest.caller,
      purpose: resolveRequest.purpose,
      operation: 'resolve',
    });

    expect(result.allowed).toBe(false);
    expect(result.deniedSecretRefs).toContain(resolveRequest.secretRefs[0]);
    expect(result.policyDecisions.some((decision) => decision.point === 'secret_binding' && decision.result === 'deny')).toBe(true);
  });
});
