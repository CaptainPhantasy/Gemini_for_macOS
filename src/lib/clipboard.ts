export const clipboard = {
  copyAsMarkdown: async (content: string, title: string) => {
    const markdown = '# ' + title + '\n\n' + content;
    await navigator.clipboard.writeText(markdown);
  },
  readAsMarkdown: async (): Promise<string> => {
    return await navigator.clipboard.readText();
  }
};