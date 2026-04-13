export const clipboard = {
  copyAsMarkdown: async (content, title) => {
    const markdown = '# ' + title + '\n\n' + content;
    await navigator.clipboard.writeText(markdown);
  },
  readAsMarkdown: async () => {
    return await navigator.clipboard.readText();
  }
};
