import { afterEach, describe, expect, test, vi } from 'vitest';
import { gmailMessageToMarkdown, integrations, type GmailMessageResponse } from '../lib/integrations';

const gmailMessage: GmailMessageResponse = {
  id: 'msg-1',
  threadId: 'thread-1',
  snippet: 'Fallback snippet',
  payload: {
    headers: [
      { name: 'From', value: 'sender@example.com' },
      { name: 'Subject', value: 'Launch Notes' },
      { name: 'Date', value: 'Sat, 30 May 2026 10:00:00 -0400' },
    ],
    parts: [
      {
        mimeType: 'text/plain',
        body: { data: btoa('Important Gmail body text').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') },
      },
    ],
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Gmail integration', () => {
  test('converts a Gmail message into source-pack markdown', () => {
    const markdown = gmailMessageToMarkdown(gmailMessage);

    expect(markdown).toContain('# Launch Notes');
    expect(markdown).toContain('- From: sender@example.com');
    expect(markdown).toContain('- Thread ID: thread-1');
    expect(markdown).toContain('Important Gmail body text');
  });

  test('imports a Gmail message as a markdown artifact payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => gmailMessage,
    } as Response);

    const result = await integrations.googleWorkspace.importGmailMessage('token', 'msg-1');

    expect(fetch).toHaveBeenCalledWith('https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-1?format=full', expect.objectContaining({ method: 'GET' }));
    expect(result).toMatchObject({
      ok: true,
      title: 'Launch Notes',
      mimeType: 'text/markdown',
      sourceFileId: 'msg-1',
      sourceType: 'gmail',
    });
    expect(result.content).toContain('Important Gmail body text');
  });
});
