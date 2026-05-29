import { describe, expect, test } from 'vitest';
import { calendarEventsToMarkdown, extractGoogleDocText } from '../lib/integrations';

describe('workspace source ingestion helpers', () => {
  test('extracts text from body and tabbed Google Docs responses', () => {
    const text = extractGoogleDocText({
      body: { content: [{ paragraph: { elements: [{ textRun: { content: 'Body line\n' } }] } }] },
      tabs: [
        {
          documentTab: {
            body: { content: [{ paragraph: { elements: [{ textRun: { content: 'Tabbed line\n' } }] } }] },
          },
        },
      ],
    });

    expect(text).toContain('Body line');
    expect(text).toContain('Tabbed line');
  });

  test('converts calendar events to bounded markdown source text', () => {
    const markdown = calendarEventsToMarkdown([
      { id: '1', summary: 'Standup', start: '2026-05-27T13:00:00Z', location: 'Office', htmlLink: 'https://calendar.google.com/event?eid=1' },
      { id: '2', summary: 'Planning', start: '2026-05-28', description: '<b>Bring notes</b>' },
    ]);

    expect(markdown).toContain('# Upcoming Calendar Events');
    expect(markdown).toContain('## Standup');
    expect(markdown).toContain('- Location: Office');
    expect(markdown).toContain('- Link: https://calendar.google.com/event?eid=1');
    expect(markdown).toContain('Bring notes');
    expect(markdown).not.toContain('<b>');
  });
});
