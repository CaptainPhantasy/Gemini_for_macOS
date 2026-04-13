export const backup = {
  createSnapshot: () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      data[key] = localStorage.getItem(key);
    }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gemini-backup-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
  },
  restore: (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = JSON.parse(e.target.result as string);
      Object.keys(data).forEach(key => localStorage.setItem(key, data[key]));
      window.location.reload();
    };
    reader.readAsText(file);
  }
};
