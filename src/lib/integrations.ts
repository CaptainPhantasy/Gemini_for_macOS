export const integrations = {
  notebookLM: {
    importSource: async (sourceId: string) => {
      try {
        const response = await fetch(`https://notebooklm.googleapis.com/v1/sources/${sourceId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('google_oauth_token')}`,
            'Content-Type': 'application/json'
          }
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
        const response = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('google_oauth_token')}`,
            'Content-Type': 'application/json'
          }
        });
        if (!response.ok) throw new Error('Failed to fetch Google Doc');
        const data = await response.json();
        const content = data.body?.content?.map((c: any) => c.paragraph?.elements?.map((e: any) => e.textRun?.content).join('')).join('\n') || '';
        return { success: true, data: content };
      } catch (error) {
        console.error('Google Docs Import Error:', error);
        return { success: false, error: String(error) };
      }
    },
    importDriveFile: async (fileId: string) => {
      try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('google_oauth_token')}`
          }
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
        const response = await fetch(`https://travel.googleapis.com/v1/trips/${tripId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('google_oauth_token')}`,
            'Content-Type': 'application/json'
          }
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
