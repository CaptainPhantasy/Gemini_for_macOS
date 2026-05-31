import { describe, expect, test } from 'vitest';
import { resolveConfiguredHeaders } from '../server/mcp-header-config';

describe('MCP header config', () => {
  test('resolves env placeholders in configured MCP headers', () => {
    expect(resolveConfiguredHeaders(
      { Authorization: '${TOKEN}', 'X-API-Key': '${TOKEN}' },
      { TOKEN: 'Bearer test-token' },
    )).toEqual({ Authorization: 'Bearer test-token', 'X-API-Key': 'Bearer test-token' });
  });
});
