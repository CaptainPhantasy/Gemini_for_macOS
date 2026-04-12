# Gemini Workspace - Local Edition

Welcome to the Gemini Workspace Local Edition, a powerful, privacy-first interface built on the Model Context Protocol (MCP) and Google's multimodal API suite (v3.1-Beta). This application achieves feature parity with the Gemini 3.1 Pro Web environment while running locally.

## Quick Start Guide

1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Configure Environment:**
   Ensure your `.env` file contains your `GEMINI_API_KEY`.
3. **Start the Application:**
   ```bash
   npm run dev
   ```
4. **Access the Workspace:**
   Open your browser to the local URL provided by Vite (typically `http://localhost:3000`).

## Feature Sets

The application is divided into several core feature sets, designed to provide a comprehensive and secure AI workspace:

### 1. Core Workspace & UI
- **Persistent Chat Interface:** A robust chat interface with thread management (create, rename, delete) stored locally.
- **Canvas Workspace:** A side-by-side editor for rendering, editing, and interacting with generated text, code, and Deep Research artifacts.
- **Theming:** Full support for Light and Dark modes with a dedicated settings panel.

### 2. Local Intelligence & Memory (MCP)
- **Gems Registry:** Create, save, and load custom agent configurations with specific system instructions.
- **Personal Intelligence:** A dedicated module for users to input direct preferences and explicit instructions that guide the AI's behavior across all interactions.
- **Scheduled Actions:** A cron-like interface to set up automated prompts and tasks.
- **Artifact Library:** A centralized hub to search, manage, and edit all generated files and outputs.

### 3. Multimodal Integrations
- **Text-to-Speech (TTS):** Instantly generate audio streams from text artifacts using `gemini-2.5-flash-preview-tts`.
- **Music Generation (Lyria 3):** Turn text into 30-second songs with realistic vocal performances using `lyria-3-clip-preview`. Includes `synth_id` watermarking verification.
- **Video Generation (Veo):** Generate video trailers and visual representations of text using `veo-3.1-lite-generate-preview`.
- **Live Mode Hooks:** WebRTC integration for local camera feeds and screen sharing.

### 4. External Integrations
- **Google Ecosystem:** Secure OAuth-based hooks for NotebookLM, Google Workspace (Docs/Drive), and Google Travel data.
- **Public Links:** Generate external URLs to share specific chat threads or artifacts securely.

## Individual Features & Usage

- **Magic Wand (AI Actions):** Inside the Canvas, click the Magic Wand icon to reveal latent AI features:
  - **Rewrite:** Instantly improves the flow, vocabulary, and professionalism of the current text.
  - **Summarize:** Condenses long artifacts into key takeaways.
  - **Generate Code:** Transforms descriptions into production-ready, documented code.
  - **Read Aloud:** Plays an audio version of the text.
  - **Turn into Song:** Creates a musical track based on the text.
  - **Generate Trailer:** Creates a short video representation.
- **MCP Security:** Every local file write or command execution requires explicit user confirmation via a custom UI modal, ensuring no silent modifications occur on your machine.

## Latent Feature Discovery & Implementation Process

During the development phase, a significant discovery was made regarding the application's latent capabilities. While powerful multimodal endpoints (Lyria, Veo, TTS) were technically wired into the backend, they were initially restricted to standard chat interactions. 

**The Discovery:** We realized that the true power of these models could be unlocked by wiring them directly into the **Canvas Workspace**. 

**The Implementation:** 
1. We exposed these latent endpoints as contextual "AI Actions" within the Canvas.
2. We implemented a dynamic media player that seamlessly handles both audio and video blobs returned by the APIs.
3. We refined the prompts for rewriting, summarizing, and code generation to ensure the outputs were immediately usable within the editor context.
This shift transformed the Canvas from a simple text editor into a fully-fledged multimodal production studio.

## Behind-the-Scenes: Alphabet/Google & Legacy AI/Floyd's Labs

This project represents a unique joint venture between Alphabet/Google and Legacy AI/Floyd's Labs. If you look closely at the architecture, you might spot a few Easter eggs:

- **The `~/.floyd/` Directory:** The original specification for local MCP storage referenced `~/.floyd/gems.json` and `~/.floyd/schedule.json`. This is a nod to Floyd's Labs' legacy infrastructure, seamlessly integrated with Google's modern MCP client.
- **Nano Banana 2:** The internal codename for the image generation model (`models/nano-banana-2`) is a playful reference from the Legacy AI team, contrasting with Google's more formal naming conventions (like Veo and Lyria).
- **The "Redo with Pro" Hook:** A subtle architectural choice designed to bridge the gap between lightweight local models and cloud-based Pro models, a concept heavily championed during the joint venture's initial brainstorming sessions.

---
*Built with React, Tailwind CSS, Vite, and the @google/genai SDK.*
