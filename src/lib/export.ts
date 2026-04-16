import type { Artifact } from '../types';

const KNOWN_EXTENSIONS = new Set([
  'js','jsx','ts','tsx','py','rs','go','html','css','sh','sql',
  'json','yaml','yml','toml','xml','md','txt',
]);

function inferExtension(artifact: Artifact): string {
  const titleExt = artifact.title.match(/\.(\w+)$/)?.[1]?.toLowerCase();
  if (titleExt && KNOWN_EXTENSIONS.has(titleExt)) {
    return titleExt;
  }

  if (artifact.type === 'text' || artifact.type === 'research') return 'md';
  if (artifact.type !== 'code') return 'txt';

  const c = artifact.content;
  if (c.startsWith('#!/usr/bin/env python') || c.startsWith('#!/usr/bin/python') || /^(import |from .+ import |def |class )/m.test(c)) return 'py';
  if (c.startsWith('#!/bin/bash') || c.startsWith('#!/bin/sh') || c.startsWith('#!/usr/bin/env bash')) return 'sh';
  if (/^(import React|from ['"]react|export default function|export const )/m.test(c) && /tsx?/.test(artifact.title)) return 'tsx';
  if (/^(import\s|export\s|const\s|let\s|function\s|class\s)/m.test(c) && (c.includes(': string') || c.includes(': number') || c.includes('interface '))) return 'ts';
  if (/^(import\s|export\s|const\s|let\s|function\s|class\s|var\s)/m.test(c)) return 'js';
  if (/<html|<!DOCTYPE/i.test(c)) return 'html';
  if (/^(fn |use |mod |struct |impl |pub )/m.test(c)) return 'rs';
  if (/^(package |func |import ")/m.test(c)) return 'go';
  if (/^(SELECT |INSERT |CREATE |ALTER |DROP )/im.test(c)) return 'sql';
  if (/^\{[\s\n]/.test(c) && c.trimEnd().endsWith('}')) return 'json';

  return 'txt';
}

function stripExtension(title: string): string {
  const ext = title.match(/\.(\w+)$/)?.[1]?.toLowerCase();
  if (ext && KNOWN_EXTENSIONS.has(ext)) {
    return title.slice(0, -(ext.length + 1));
  }
  return title;
}

export const exportArtifact = async (artifact: Artifact): Promise<void> => {
  const ext = inferExtension(artifact);
  const baseName = stripExtension(artifact.title).replace(/ /g, '_');
  const filename = `${baseName}.${ext}`;

  const mimeMap: Record<string, string> = {
    html: 'text/html',
    json: 'application/json',
    xml: 'application/xml',
    css: 'text/css',
    md: 'text/markdown',
  };
  const mimeType = mimeMap[ext] ?? 'text/plain';

  const blob = new Blob([artifact.content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
