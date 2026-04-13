/**
 * API Configuration Service
 * 
 * Securely handles API initialization without exposing keys in client code.
 * In production, the API key should be injected via backend middleware or secure env vars.
 */

import { GoogleGenAI } from '@google/genai';

let _aiInstance: GoogleGenAI | null = null;

/**
 * Initialize the AI client with the API key from secure source
 * In Google AI Studio, the key is automatically injected
 * In production, this should use a backend proxy
 */
export async function initializeAI(): Promise<GoogleGenAI> {
  if (_aiInstance) {
    return _aiInstance;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. ' +
      'In AI Studio, ensure the key is set in Secrets. ' +
      'In other environments, configure via backend API.'
    );
  }

  _aiInstance = new GoogleGenAI({ apiKey });
  return _aiInstance;
}

/**
 * Get the AI client instance
 * Lazy initialization ensures the key is only accessed when needed
 */
export async function getAI(): Promise<GoogleGenAI> {
  if (!_aiInstance) {
    return initializeAI();
  }
  return _aiInstance;
}

/**
 * Reset the AI client (for testing)
 */
export function resetAI(): void {
  _aiInstance = null;
}
