import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Artifact } from "../types";
import { v4 as uuidv4 } from "uuid";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Detects if a string contains content that should be an artifact.
 * Currently looks for code blocks or research patterns.
 */
export function detectArtifacts(content: string): Artifact[] {
  const artifacts: Artifact[] = [];
  
  // 1. Detect Code Blocks
  const codeBlockRegex = /```([a-zA-Z]*)\n([\s\S]*?)```/g;
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || 'text';
    const code = match[2].trim();
    
    if (code.length > 50) {
      artifacts.push({
        id: uuidv4(),
        title: `Generated ${language.charAt(0).toUpperCase() + language.slice(1)}`,
        content: code,
        type: 'code',
        createdAt: Date.now()
      });
    }
  }
  
  // 2. Detect Research (Search results pattern)
  if (content.includes('Search results:') || content.includes('Found following information:')) {
    artifacts.push({
      id: uuidv4(),
      title: 'Research Findings',
      content: content,
      type: 'research',
      createdAt: Date.now()
    });
  }

  // 3. Detect large Markdown sections
  if (artifacts.length === 0 && content.length > 1000) {
     artifacts.push({
       id: uuidv4(),
       title: 'Deep Analysis',
       content: content,
       type: 'text',
       createdAt: Date.now()
     });
  }
  
  return artifacts;
}
