/**
 * Google Integrations
 * 
 * SECURITY: OAuth tokens are now managed securely via backend HttpOnly cookies.
 * The frontend never handles tokens directly.
 * All API calls include credentials: 'include' to send cookies.
 */

export const integrations = {
  notebookLM: {
    importSource: async (sourceId: string) => {
      try {
        // Backend will include the OAuth token via HttpOnly cookie
        const response = await fetch(`/api/google/notebooklm/sources/${sourceId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include' // Backend authenticates via HttpOnly cookie
        });
        if (!response.ok) throw new Error('Failed to fetch NotebookLM source');
        const data = await response.json();
        return { success: true, data: JSON.stringify(data) };
      } catch (error) {
        console.error('NotebookLM Import Error:', error);
        return { success: false, error: String(error) };
      }
    }
  },
  googleWorkspace: {
    importDoc: async (docId: string) => {
      try {
        // Backend will include the OAuth token via HttpOnly cookie
        const response = await fetch(`/api/google/docs/${docId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include' // Backend authenticates via HttpOnly cookie
        });
        if (!response.ok) throw new Error('Failed to fetch Google Doc');
        const data = await response.json();
        const content = data.body?.content?.map((c: Record<string, unknown>) => {
          const paragraph = c.paragraph as Record<string, unknown>;
          const elements = paragraph?.elements as Record<string, unknown>[];
          return elements?.map((e: Record<string, unknown>) => {
            const textRun = e.textRun as Record<string, unknown>;
            return textRun?.content;
          }).join('');
        }).join('\n') || '';
        return { success: true, data: content };
      } catch (error) {
        console.error('Google Docs Import Error:', error);
        return { success: false, error: String(error) };
      }
    },
    importDriveFile: async (fileId: string) => {
      try {
        // Backend will include the OAuth token via HttpOnly cookie
        const response = await fetch(`/api/google/drive/files/${fileId}`, {
          method: 'GET',
          credentials: 'include' // Backend authenticates via HttpOnly cookie
        });
        if (!response.ok) throw new Error('Failed to fetch Drive File');
        const data = await response.text();
        return { success: true, data };
      } catch (error) {
        console.error('Google Drive Import Error:', error);
        return { success: false, error: String(error) };
      }
    }
  },
  googleTravel: {
    getItinerary: async (tripId: string) => {
      try {
        // Backend will include the OAuth token via HttpOnly cookie
        const response = await fetch(`/api/google/travel/trips/${tripId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include' // Backend authenticates via HttpOnly cookie
        });
        if (!response.ok) throw new Error('Failed to fetch Travel Itinerary');
        const data = await response.json();
        return { success: true, data: JSON.stringify(data) };
      } catch (error) {
        console.error('Google Travel Import Error:', error);
        return { success: false, error: String(error) };
      }
    }
  }
};
