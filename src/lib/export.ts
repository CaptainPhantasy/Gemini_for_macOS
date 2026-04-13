export const exportArtifact = async (artifact, format) => {
  const content = artifact.content;
  const filename = artifact.title.replace(/ /g, '_') + '.' + format;
  const blob = new Blob([content], { type: 'text/' + format });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
