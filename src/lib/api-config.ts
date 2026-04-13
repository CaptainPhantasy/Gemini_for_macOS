/**
 * API Configuration Service
 * 
 * Securely handles API initialization without exposing keys in client code.
 * In production, the API key should be injected via backend middleware or secure env vars.
 */

import { GoogleGenAI } from '@google/genai';
import { storage } from './storage';

let _aiInstance: GoogleGenAI | null = null;
let _currentApiKey: string | null = null;

/**
 * Initialize the AI client with the API key from secure source
 * In Google AI Studio, the key is automatically injected
 * In production, this should use a backend proxy
 */
export async function initializeAI(): Promise<GoogleGenAI> {
  const settings = storage.getSettings();
  const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;

  if (_aiInstance && _currentApiKey === apiKey) {
    return _aiInstance;
  }
  
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. ' +
      'Please enter your API Key in the Settings menu.'
    );
  }

  _currentApiKey = apiKey;
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
