import { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Chat } from './components/Chat';
import { Canvas } from './components/Canvas';
import { PersonalIntelligencePopup } from './components/PersonalIntelligence';
import { Settings } from './components/Settings';
import { GemsRegistry } from './components/GemsRegistry';
import { ScheduledActions } from './components/ScheduledActions';
import { ArtifactLibrary } from './components/ArtifactLibrary';
import { Thread, Message, Artifact, AppSettings, BudgetConfig, DEFAULT_BUDGET_CONFIG } from './types';
import { storage } from './lib/storage';
import { mcpClient } from './lib/mcp';
import { buildDirectoryLockPrompt } from './lib/directory-lock';
import { buildAgentSystemPrompt, buildGeminiTools, extractResponseParts, buildFunctionResponse, parseToolRequest } from './lib/agent-tools';
import { shouldAutoApproveToolCall, type ToolAction } from './lib/autonomy';
import { autoSyncArtifact } from './lib/drive-sync';
import { v4 as uuidv4 } from 'uuid';
import { getAI } from './lib/api-config';
import { SplashScreen } from './components/SplashScreen';
import { ShieldAlert, Plus, Search as SearchIcon, Settings as SettingsIcon, Camera, Sun, Moon, Menu } from 'lucide-react';
import { detectArtifacts } from './lib/utils';
import { Search } from "./components/Search";
import { CommandPalette } from "./components/CommandPalette";
import { Help } from "./components/Help";
import { LiveMode } from "./components/LiveMode";
import { Integrations } from "./components/Integrations";
import { ShortcutEditor } from "./components/ShortcutEditor";
import { useKeyboardShortcuts } from "./lib/useKeyboardShortcuts";
import { setupAutosave } from "./lib/autosave";
import { windowState } from "./lib/windowState";
import { costLedger, PRICING } from "./lib/cost-ledger";
import { logger } from "./lib/logger";
import { generateWithFailover } from './lib/generation-wrapper';
import { withGeminiContextCache } from './lib/context-cache';
import { selectModel } from './lib/model-orchestrator';
import { WelcomeScreen } from "./components/WelcomeScreen";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { exportThreadAsMarkdown } from "./lib/thread-export";
import { getShellMode, normalizeShellDrawersForMode, type ShellMode } from './lib/shell-mode';
const MODEL_CONTEXT_MESSAGE_LIMIT = 40;
export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  
  const [showPI, setShowPI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGems, setShowGems] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showShortcutEditor, setShowShortcutEditor] = useState(false);
  const [showLiveMode, setShowLiveMode] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(storage.getSettings());

  // Shell mode is viewport-derived, not user-agent-derived. The wrappers below
  // choose compact/mobile, medium/tablet, or expanded/desktop composition.
  const [shellMode, setShellMode] = useState<ShellMode>(() => (
    typeof window === 'undefined' ? 'expanded' : getShellMode(window.innerWidth)
  ));
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [canvasDrawerOpen, setCanvasDrawerOpen] = useState(false);
  const navRailClosedWidth = 56;
  const canvasRailClosedWidth = 56;
  const navRailOpenWidth = 'min(300px, calc(100dvw - 112px))';
  const canvasRailOpenWidth = 'clamp(320px, 50dvw, calc(100dvw - 112px))';
  const compactMenuButtonRef = useRef<HTMLButtonElement>(null);
  const previousShellModeRef = useRef<ShellMode>(shellMode);
  const resizeFrameRef = useRef<number | null>(null);
  const lastOverlayTriggerRef = useRef<HTMLElement | null>(null);

  const rememberOverlayTrigger = () => {
    const activeElement = document.activeElement;
    lastOverlayTriggerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
  };

  const closeMobileSidebar = () => {
    setMobileSidebarOpen(false);
    if (shellMode === 'compact') {
      requestAnimationFrame(() => compactMenuButtonRef.current?.focus());
    }
  };
  const openMobileSidebar = () => {
    rememberOverlayTrigger();
    setMobileSidebarOpen(true);
  };
  const closeCanvasPanel = () => {
    setActiveArtifact(null);
    if (shellMode !== 'expanded') {
      requestAnimationFrame(() => lastOverlayTriggerRef.current?.focus());
    }
  };
  const openArtifactInShell = (artifact: Artifact) => {
    rememberOverlayTrigger();
    setActiveArtifact(artifact);
    if (shellMode === 'expanded') {
      setCanvasDrawerOpen(true);
    }
  };
  // Wrap any sidebar callback so picking an item also closes the compact drawer.
  const whileClosingDrawer = (fn: () => void) => () => {
    closeMobileSidebar();
    fn();
  };

  const theme = settings.theme === 'system' 
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : settings.theme;

  // MCP Permission State
  const [mcpRequest, setMcpRequest] = useState<{
    action: string;
    path: string;
    resolve: (value: boolean) => void;
  } | null>(null);

  // Connect to MCP server on mount so tools are loaded before first message.
  useEffect(() => {
    mcpClient.init();
  }, []);

  useEffect(() => {
    const openSettings = () => setShowSettings(true);
    const openSettingsFromHash = () => {
      if (window.location.hash === '#settings') setShowSettings(true);
    };
    window.addEventListener('gemini-open-settings', openSettings);
    window.addEventListener('hashchange', openSettingsFromHash);
    openSettingsFromHash();
    return () => {
      window.removeEventListener('gemini-open-settings', openSettings);
      window.removeEventListener('hashchange', openSettingsFromHash);
    };
  }, []);

  useEffect(() => {
    // Register MCP permission handler. The modes control prompting only;
    // Desktop Commander remains the local tool surface in every mode.
    mcpClient.setDirectoryLock(settings.directoryLock);
    mcpClient.setPermissionHandler(async (action, path) => {
      if (shouldAutoApproveToolCall(settings.autonomyMode, action as ToolAction)) {
        return true;
      }

      return new Promise((resolve) => {
        setMcpRequest({ action, path, resolve });
      });
    });
  }, [settings.autonomyMode, settings.mcpServers, settings.directoryLock]);

  useEffect(() => {
    const syncShellMode = () => {
      if (resizeFrameRef.current != null) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        setShellMode(getShellMode(window.innerWidth));
      });
    };

    window.addEventListener('resize', syncShellMode);
    return () => {
      window.removeEventListener('resize', syncShellMode);
      if (resizeFrameRef.current != null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (previousShellModeRef.current === shellMode) return;

    previousShellModeRef.current = shellMode;
    const normalized = normalizeShellDrawersForMode(shellMode, {
      mobileSidebarOpen,
      navDrawerOpen,
      canvasDrawerOpen,
    });

    setMobileSidebarOpen(normalized.mobileSidebarOpen);
    setNavDrawerOpen(normalized.navDrawerOpen);
    setCanvasDrawerOpen(normalized.canvasDrawerOpen);
  }, [shellMode]);

  useEffect(() => {
    const closeTransientShellLayer = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (shellMode === 'compact' && mobileSidebarOpen) {
        event.preventDefault();
        closeMobileSidebar();
        return;
      }

      if ((shellMode === 'compact' || shellMode === 'medium') && activeArtifact) {
        event.preventDefault();
        closeCanvasPanel();
      }
    };

    window.addEventListener('keydown', closeTransientShellLayer);
    return () => window.removeEventListener('keydown', closeTransientShellLayer);
  }, [activeArtifact, mobileSidebarOpen, shellMode]);

  useEffect(() => {
    const initStorage = async () => {
      await storage.init();
      const currentSettings = storage.getSettings();
      setSettings(currentSettings);
      mcpClient.updateServers(currentSettings.mcpServers);
      
      const loadedThreads = storage.getThreads();
      setThreads([...loadedThreads]);
      if (loadedThreads.length > 0) {
        // Restore the last active thread from window state, falling back to
        // the most recently updated thread if the saved ID no longer exists.
        const saved = windowState.load();
        const lastId = saved.activeThreadId as string | undefined;
        const match = lastId ? loadedThreads.find(t => t.id === lastId) : null;
        const best = match
          ? match
          : [...loadedThreads].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        setActiveThreadId(best.id);
      }

    };
    initStorage();
  }, []);

  // Feature 4: Wire autosave — persist active thread + artifact every 30s
  useEffect(() => {
    const autosaver = setupAutosave(() => ({
      threads,
      activeThreadId,
      activeArtifact,
    }));
    autosaver.start();
    return () => autosaver.stop();
  }, [threads, activeThreadId, activeArtifact]);

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'theme-gemini');
    
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'gemini') {
      document.documentElement.classList.add('dark', 'theme-gemini');
    }
    
    windowState.save({
      theme: theme as 'light' | 'dark' | 'system' | 'gemini',
      activeThreadId,
    });
  }, [theme, activeThreadId]);

  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await storage.saveSettings(newSettings);
    mcpClient.updateServers(newSettings.mcpServers);
  };

  
  

  const handleDeleteThread = async (id: string) => {
    await storage.deleteThread(id);
    const remaining = storage.getThreads();
    setThreads([...remaining]);
    if (activeThreadId === id) {
      if (remaining.length > 0) {
        setActiveThreadId(remaining[0].id);
      } else {
        const fresh: Thread = {
          id: uuidv4(),
          title: 'New Chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await storage.saveThread(fresh);
        setThreads([...storage.getThreads()]);
        setActiveThreadId(fresh.id);
      }
      setActiveArtifact(null);
    }
  };

  const handleRenameThread = async (id: string, title: string) => {
    await storage.renameThread(id, title);
    setThreads([...storage.getThreads()]);
  };

  // Feature 14: Pin/unpin thread
  const handlePinThread = async (id: string) => {
    const thread = threads.find(t => t.id === id);
    if (!thread) return;
    const updated = { ...thread, pinned: !thread.pinned, updatedAt: Date.now() };
    await storage.saveThread(updated);
    setThreads([...storage.getThreads()]);
  };

  // Feature 11: Export thread
  const handleExportThread = (id: string) => {
    const thread = threads.find(t => t.id === id);
    if (thread) exportThreadAsMarkdown(thread);
  };

  const handleNewThread = async () => {
    const newThread: Thread = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await storage.saveThread(newThread);
    setThreads([...storage.getThreads()]);
    setActiveThreadId(newThread.id);
    setActiveArtifact(null);
  };
  const paletteActions = [
    { label: "New Chat", icon: <Plus size={16} />, shortcut: "Cmd+N", action: handleNewThread },
    { label: "Search", icon: <SearchIcon size={16} />, shortcut: "Cmd+K", action: () => setShowSearch(true) },
    { label: "Settings", icon: <SettingsIcon size={16} />, shortcut: "Cmd+,", action: () => setShowSettings(true) },
    { label: "Live Mode", icon: <Camera size={16} />, shortcut: "Cmd+L", action: () => setShowLiveMode(true) },
    { label: "Toggle Theme", icon: theme === "dark" ? <Sun size={16} /> : <Moon size={16} />, shortcut: "Cmd+T", action: () => handleUpdateSettings({...settings, theme: theme === "dark" ? "light" : "dark"}) },
  ];

  const defaultShortcuts: Record<string, () => void> = {
    "cmd+n": handleNewThread,
    "cmd+k": () => setShowSearch(true),
    // Cmd+Shift+P shadowed by Chrome incognito (Plan v3 Bug #5); rebind to Cmd+Shift+K.
    "cmd+shift+k": () => setShowCommandPalette(true),
    "cmd+,": () => setShowSettings(true),
    "cmd+t": () => handleUpdateSettings({...settings, theme: theme === "dark" ? "light" : "dark"}),
    "cmd+l": () => setShowLiveMode(true),
    "f1": () => setShowHelp(true),
    // Feature 18: Undo/Redo — browser handles these natively for text inputs,
    // but we add explicit bindings so the shortcut editor can display them.
    "cmd+z": () => document.execCommand('undo'),
    "cmd+shift+z": () => document.execCommand('redo'),
  };

  // Apply user shortcut overrides: remap default combos to custom combos.
  const shortcutOverrides = settings.shortcutOverrides ?? {};
  const shortcuts: Record<string, () => void> = {};
  for (const [defaultCombo, action] of Object.entries(defaultShortcuts)) {
    const customCombo = shortcutOverrides[defaultCombo] ?? defaultCombo;
    shortcuts[customCombo] = action;
  }
  useKeyboardShortcuts(shortcuts);

  const activeThread = threads.find(t => t.id === activeThreadId);

  const handleSetGem = async (gemId: string | undefined) => {
    if (!activeThread) return;
    const updated = { ...activeThread, gemId, updatedAt: Date.now() };
    await storage.saveThread(updated);
    setThreads([...storage.getThreads()]);
  };

  const handleSendMessage = async (content: string, _type?: string, attachment?: { dataUri: string; mimeType: string; name: string }) => {
    const threadForSend = activeThread ?? {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (!activeThread) {
      setActiveThreadId(threadForSend.id);
    }
    setIsLoading(true);

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now()
    };

    const updatedMessages = [...threadForSend.messages, userMsg];
    
    const updatedThread = {
      ...threadForSend,
      messages: updatedMessages,
      title: threadForSend.messages.length === 0 ? content.slice(0, 30) + '...' : threadForSend.title,
      updatedAt: Date.now()
    };

    await storage.saveThread(updatedThread);
    setThreads([...storage.getThreads()]);

    // Generate response
    try {
      const pi = storage.getPersonalIntelligence();
      const userPrefs = `User Preferences: ${pi.preferences}\nInstructions: ${pi.instructions}`;

      // Gem injection — if the active thread has a Gem assigned, prepend its
      // systemInstruction so the model adopts the Gem's persona/instructions.
      const gems = storage.getGems();
      const activeGem = threadForSend.gemId ? gems.find(g => g.id === threadForSend.gemId) : null;

      // Tool-aware system prompt — teaches the model about Desktop Commander MCP
      // capabilities, its persistent memory directory, and the Tool:/Args: protocol
      // that parseToolRequest understands.
      const tools = await mcpClient.awaitTools();
      const toolPrompt = buildAgentSystemPrompt(tools);
      const memoryNotice =
        `PERSISTENT MEMORY:\n` +
        `You have a durable memory directory at ` +
        `"/Volumes/SanDisk1Tb/GEMINI for MacOS/.gemini-memory/". ` +
        `Use read_file on .gemini-memory/summary.md at the start of a task to ` +
        `restore prior context, and write_file to update it with durable facts. ` +
        `Never store secrets there. See .gemini-memory/README.md for layout.`;
      const directoryLockNotice = buildDirectoryLockPrompt(settings.directoryLock);
      const systemInstruction = [activeGem?.systemInstruction, toolPrompt, directoryLockNotice, memoryNotice, userPrefs]
        .filter(Boolean)
        .join('\n\n');

      // Conversation history — window to recent turns before sending to the model.
      // Keeps function-call compatibility and caps token growth on long threads.
      const workingMessages = updatedMessages.length <= MODEL_CONTEXT_MESSAGE_LIMIT
        ? updatedMessages
        : updatedMessages.slice(-MODEL_CONTEXT_MESSAGE_LIMIT);
      const historyContents = workingMessages.map((m, i, arr) => {
        const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: m.content }];
        if (attachment && i === arr.length - 1 && m.role === 'user') {
          const base64 = attachment.dataUri.split(',')[1];
          if (base64) {
            parts.push({ inlineData: { mimeType: attachment.mimeType, data: base64 } });
          }
        }
        return { role: m.role === 'model' ? 'model' : 'user', parts };
      });

      const ai = await getAI();
      console.log('Sending message to model with history:', historyContents.length, 'turns');

      const geminiTools = buildGeminiTools(tools, !!settings.searchEnabled);

      // ── Intent-driven model orchestration (Roadmap §3c) ──────────────────
      // Evaluate the message content and available tools to select the optimal
      // model. High-impact actions (WRITE/EXECUTE) route to the pro model with
      // thinking budgets; read-only queries route to the flash model for speed.
      const modelSelection = selectModel(content, tools, settings);
      const selectedModel = modelSelection.model;
      const thinkingConfig = modelSelection.thinkingBudget
        ? { thinkingBudget: modelSelection.thinkingBudget }
        : undefined;
      console.log(`[orchestrator] ${modelSelection.reason} → ${selectedModel}`);

      // ── Fix: Use ai.models.generateContent with proper history management ──
      // The manual workingContents loop correctly preserves functionCall and
      // functionResponse parts in the conversation history, preventing the
      // context window fragmentation that caused the two-turn freeze.
      // Key fixes applied:
      // 1. Model content parts are preserved verbatim (including thought signatures)
      // 2. Function responses are appended as proper user-role messages
      // 3. Stale closure race condition is fixed (see finalThread below)
      const workingContents: Array<Record<string, unknown>> = [...historyContents];
      let response: any;
      let responseText = '';
      for (let iter = 0; iter < 10; iter++) {
        // ── Dual-tier cascading failover (Roadmap §3b) ───────────────────
        // Wrap the generation call with automatic retry and model fallback.
        // If the primary model fails with a transient error, retry with
        // exponential backoff. If retries exhaust, fall back to textFallback.
        const generationConfig = await withGeminiContextCache(ai, selectedModel, {
          systemInstruction: systemInstruction.trim() ? systemInstruction : undefined,
          thinkingConfig,
          tools: geminiTools.length > 0 ? geminiTools : undefined,
        });

        const result = await generateWithFailover({
          ai,
          model: selectedModel,
          fallbackModel: settings.models?.textFallback,
          contents: workingContents as any,
          config: generationConfig,
        });
        response = result.response;


        const { text, functionCalls } = extractResponseParts(response);

        // ── In-flight budget interception ──────────────────────────────────
        // Evaluate cumulative token usage after each generation call. If the
        // running total exceeds configured thresholds, abort immediately to
        // prevent cost overruns. This mirrors the public Gemini workspace which
        // limits and halts runaway tasks mid-stream.
        const budget: BudgetConfig = settings.cost
          ? {
              maxThinkingTokens: settings.thinkingBudgets?.text ?? 0,
              maxOutputTokens: 0,
              maxCostUsdPerRequest: 0,
              dailyThresholdUsd: settings.cost.dailyThresholdUsd ?? 0,
            }
          : DEFAULT_BUDGET_CONFIG;
        const usage: any = (response as any)?.usageMetadata;
        if (usage && budget.dailyThresholdUsd > 0) {
          const inputTokens = usage.promptTokenCount ?? 0;
          const outputTokens = usage.candidatesTokenCount ?? 0;
          const thinkingTokens = usage.thoughtsTokenCount ?? 0;
          const pricing = PRICING[selectedModel];
          if (pricing) {
            const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
            const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
            const thinkCost = (thinkingTokens / 1_000_000) * (pricing.thinkingPerMillion ?? pricing.outputPerMillion);
            const totalCost = inputCost + outputCost + thinkCost;
            try {
              const todaySpend = await costLedger.todayUsd();
              if (todaySpend + totalCost > budget.dailyThresholdUsd) {
                logger.warn(`[budget] Daily spend threshold exceeded: $${(todaySpend + totalCost).toFixed(4)} > $${budget.dailyThresholdUsd}`);
                responseText = `⚠️ Budget limit reached: daily spend ($${(todaySpend + totalCost).toFixed(2)}) would exceed the $${budget.dailyThresholdUsd} threshold. Generation stopped.`;
                break;
              }
            } catch (e) {
              logger.warn("[budget] Could not check daily spend", e);
            }
          }
        }
        if (usage && budget.maxThinkingTokens > 0 && (usage.thoughtsTokenCount ?? 0) > budget.maxThinkingTokens) {
          logger.warn(`[budget] Thinking token budget exceeded: ${usage.thoughtsTokenCount} > ${budget.maxThinkingTokens}`);
          responseText = `⚠️ Thinking token budget exceeded (${usage.thoughtsTokenCount} / ${budget.maxThinkingTokens}). Generation stopped.`;
          break;
        }

        // ── Native function-calling path (preferred) ──
        if (functionCalls.length > 0) {
          // Append the model's raw response content (preserves thought signatures,
          // thought parts, and any other fields the SDK/API requires).
          // This is the recommended approach per Gemini 3 docs — never reconstruct
          // function call parts manually, as it loses thought signatures.
          const modelContent = (response as any)?.candidates?.[0]?.content;
          if (modelContent) {
            workingContents.push({
              role: 'model',
              parts: modelContent.parts,
            });
          } else {
            // Fallback if raw content unavailable
            workingContents.push({
              role: 'model',
              parts: functionCalls.map(fc => ({
                functionCall: { name: fc.name, args: fc.args },
              })),
            });
          }

          // Execute each tool call and feed results back
          for (const fc of functionCalls) {
            try {
              const toolResult = await mcpClient.executeTool(fc.name, fc.args);
              const funcResponse = buildFunctionResponse(fc.name, toolResult, fc.id);
              workingContents.push(funcResponse);
            } catch (toolErr) {
              workingContents.push(
                buildFunctionResponse(fc.name, { error: String(toolErr) }, fc.id)
              );
            }
          }
          continue; // next iteration — model may call more tools
        }

        // ── Text path: model returned a text response (possibly with Tool:/Args:) ──
        responseText = text;
        const toolReq = parseToolRequest(responseText);
        if (toolReq) {
          // Legacy fallback: model used text-based protocol
          try {
            const toolResult = await mcpClient.executeTool(toolReq.toolName, toolReq.args);
            const resultText =
              typeof toolResult === 'string'
                ? toolResult
                : JSON.stringify(toolResult, null, 2);
            workingContents.push(
              { role: 'model', parts: [{ text: responseText }] },
              { role: 'user', parts: [{ text: `TOOL_RESULT ${toolReq.toolName}:\n${resultText}` }] }
            );
          } catch (toolErr) {
            workingContents.push(
              { role: 'model', parts: [{ text: responseText }] },
              { role: 'user', parts: [{ text: `TOOL_ERROR ${toolReq.toolName}: ${String(toolErr)}` }] }
            );
          }
          continue;
        }

        // Pure text response with no tool calls — done.
        break;
      }
      console.log('Final response text:', responseText);

      // ── Fallback: if the model returned only function calls across all iterations
      // and never produced a text summary, synthesize one from the tool results
      // so the user sees something instead of an empty "0 words" bubble.
      if (!responseText || responseText.trim().length === 0) {
        const observedToolCalls: string[] = [];
        for (const content of workingContents) {
          const parts = (content as any)?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (part.functionResponse) {
                const name = part.functionResponse.name || 'unknown_tool';
                const response = part.functionResponse.response;
                const status = response && typeof response === 'object' && 'error' in response ? 'FAILED' : 'OBSERVED';
                observedToolCalls.push(`- ${name}: ${status}`);
              }
            }
          }
        }
        if (observedToolCalls.length > 0) {
          responseText = 'Tool execution completed, but the model did not provide a final summary.\n\n' +
            'Observed tool calls:\n' +
            observedToolCalls.join('\n') +
            '\n\nRaw details are available in debug mode.';
          console.log('[fallback] Synthesized safe tool-call summary:', responseText.length, 'chars');
        } else {
          responseText = 'No current-session evidence available. The model returned an empty response and no tool results were observed. Please try again or rephrase your request.';
          console.log('[fallback] No tool results found; using evidence-safe generic message');
        }
      }
      console.log('Final response text:', responseText);

      // Phase 3b — log cost for this chat call (best-effort; never block UX on failure).
      try {
        const usage: any = (response as any)?.usageMetadata ?? {};
        await costLedger.record({
          timestamp: Date.now(),
          model: selectedModel,
          capability: 'chat',
          inputTokens: usage.promptTokenCount ?? 0,
          outputTokens: usage.candidatesTokenCount ?? 0,
          thinkingTokens: usage.thoughtsTokenCount ?? 0,
        });
      } catch (costErr) {
        logger.warn('[cost-ledger] Failed to record chat cost', costErr);
      }
      
      // Detect artifacts in the response
      const detectedArtifacts = detectArtifacts(responseText);
      
      // Save artifacts to storage + auto-sync to Drive if enabled
      for (const artifact of detectedArtifacts) {
        await storage.saveArtifact(artifact);
        autoSyncArtifact(artifact).catch(() => {});
      }

      const modelMsg: Message = {
        id: uuidv4(),
        role: 'model',
        content: responseText,
        timestamp: Date.now(),
        type: detectedArtifacts.length > 0 ? 'artifact' : 'text',
        artifactData: detectedArtifacts.length > 0 ? detectedArtifacts[0] : undefined
      };

      // Fix: Read fresh thread state from storage before saving to prevent
      // stale closure overwrites. Any external action (cron, edit, pin) that
      // modified the thread during the async generation window would otherwise
      // be wiped out by the captured `updatedThread` reference.
      const currentThread = storage.getThreads().find(t => t.id === threadForSend.id) || updatedThread;
      const finalThread = {
        ...currentThread,
        messages: [...currentThread.messages, modelMsg],
        updatedAt: Date.now()
      };

      await storage.saveThread(finalThread);
      setThreads([...storage.getThreads()]);

      // Automatically open the first artifact in the Canvas
      if (detectedArtifacts.length > 0) {
        openArtifactInShell(detectedArtifacts[0]);
      }
    } catch (error) {
      console.error('Error generating content:', error);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Feature 10: Regenerate last model response
  const handleRegenerate = async () => {
    if (!activeThread) return;
    const msgs = activeThread.messages;
    // Find last user message
    const lastUserIdx = msgs.reduce((acc, m, i) => m.role === 'user' ? i : acc, -1);
    if (lastUserIdx < 0) return;
    const lastUserMsg = msgs[lastUserIdx];
    // Remove all messages after the last user message
    const trimmedMessages = msgs.slice(0, lastUserIdx);
    const trimmedThread = { ...activeThread, messages: trimmedMessages, updatedAt: Date.now() };
    await storage.saveThread(trimmedThread);
    setThreads([...storage.getThreads()]);
    // Re-send the last user message
    await handleSendMessage(lastUserMsg.content);
  };

  // Feature 15: Edit user message and resubmit
  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeThread) return;
    const msgIndex = activeThread.messages.findIndex(m => m.id === messageId);
    if (msgIndex < 0) return;
    // Keep only messages up to (but not including) the edited message
    const trimmedMessages = activeThread.messages.slice(0, msgIndex);
    const trimmedThread = { ...activeThread, messages: trimmedMessages, updatedAt: Date.now() };
    await storage.saveThread(trimmedThread);
    setThreads([...storage.getThreads()]);
    // Send the new content
    await handleSendMessage(newContent);
  };

  const handleMcpResponse = (allowed: boolean) => {
    if (mcpRequest) {
      mcpRequest.resolve(allowed);
      setMcpRequest(null);
    }
  };

  const renderSkipLink = () => (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
    >
      Skip to main content
    </a>
  );

  const renderSidebar = (
    drawerOpen: boolean,
    onDrawerOpenChange: (open: boolean) => void,
  ) => (
    <Sidebar
      threads={threads}
      activeThreadId={activeThreadId}
      onSelectThread={(id) => {
        closeMobileSidebar();
        setActiveThreadId(id);
        setActiveArtifact(null);
      }}
      onNewThread={whileClosingDrawer(handleNewThread)}
      onOpenSettings={whileClosingDrawer(() => setShowSettings(true))}
      onOpenGems={whileClosingDrawer(() => setShowGems(true))}
      onOpenSchedule={whileClosingDrawer(() => setShowSchedule(true))}
      onOpenPI={whileClosingDrawer(() => setShowPI(true))}
      onOpenArtifacts={whileClosingDrawer(() => setShowArtifacts(true))}
      onOpenLiveMode={whileClosingDrawer(() => setShowLiveMode(true))}
      onOpenIntegrations={whileClosingDrawer(() => setShowIntegrations(true))}
      onOpenHelp={whileClosingDrawer(() => setShowHelp(true))}
      onOpenShortcutEditor={whileClosingDrawer(() => setShowShortcutEditor(true))}
      onDeleteThread={handleDeleteThread}
      onRenameThread={handleRenameThread}
      onPinThread={handlePinThread}
      onExportThread={handleExportThread}
      onOpenArtifact={(artifact, threadId) => {
        closeMobileSidebar();
        setActiveThreadId(threadId);
        openArtifactInShell(artifact);
      }}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={onDrawerOpenChange}
    />
  );

  const renderChat = () => (
    <div
      id="main-content"
      tabIndex={-1}
      className="main-shell-content min-h-0 min-w-0 flex relative overflow-hidden outline-none"
      role="main"
      aria-label="Main chat area"
    >
      <Chat
        messages={activeThread?.messages || []}
        onSendMessage={handleSendMessage}
        onOpenArtifact={(artifact) => {
          if (typeof artifact === 'object' && artifact !== null) {
            openArtifactInShell(artifact as Artifact);
          } else if (typeof artifact === 'string') {
            // Handle string artifact data if needed
            closeCanvasPanel();
          }
        }}
        gems={storage.getGems().map(g => ({ id: g.id, name: g.name }))}
        activeGemId={activeThread?.gemId}
        onSetGem={handleSetGem}
        isLoading={isLoading}
        onRegenerate={handleRegenerate}
        onEditMessage={handleEditMessage}
      />
    </div>
  );

  const renderCanvas = (
    drawerOpen: boolean,
    onDrawerOpenChange: (open: boolean) => void,
  ) => (
    <Canvas
      artifact={activeArtifact}
      onClose={closeCanvasPanel}
      settings={settings}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={onDrawerOpenChange}
    />
  );

  const renderSharedOverlays = () => (
    <>
      {showPI && <PersonalIntelligencePopup onClose={() => setShowPI(false)} />}
      {showSettings && <Settings onClose={() => { setShowSettings(false); if (window.location.hash === '#settings') history.replaceState(null, '', window.location.pathname + window.location.search); }} settings={settings} onUpdateSettings={handleUpdateSettings} />}
      {showGems && <GemsRegistry onClose={() => setShowGems(false)} />}
      {showSchedule && <ScheduledActions onClose={() => setShowSchedule(false)} onRunPrompt={handleSendMessage} />}
      {showArtifacts && <ArtifactLibrary onClose={() => setShowArtifacts(false)} onOpenArtifact={(artifact) => { openArtifactInShell(artifact); setShowArtifacts(false); }} />}
      {showSearch && <Search onClose={() => setShowSearch(false)} onOpenThread={(id) => setActiveThreadId(id)} onOpenArtifact={(a) => openArtifactInShell(a)} />}
      {showCommandPalette && <CommandPalette onClose={() => setShowCommandPalette(false)} actions={paletteActions} />}
      {showHelp && <Help onClose={() => setShowHelp(false)} />}
      {showShortcutEditor && <ShortcutEditor onClose={() => setShowShortcutEditor(false)} shortcuts={shortcuts} overrides={settings.shortcutOverrides ?? {}} onUpdateOverrides={(o) => handleUpdateSettings({ ...settings, shortcutOverrides: o })} />}
      {showLiveMode && (
        <LiveMode
          onClose={() => setShowLiveMode(false)}
          captionsDefault={settings.liveMode?.voiceTranscriptionEnabled ?? false}
          enableCamera={settings.liveMode?.cameraTranscriptionEnabled ?? true}
          enableScreen={settings.liveMode?.screenTranscriptionEnabled ?? true}
        />
      )}
      <Integrations
        isOpen={showIntegrations}
        onClose={() => setShowIntegrations(false)}
        gcpClientId={settings.gcpOAuthClientId}
        notebookLmEnabled={settings.notebookLmEnabled}
        activeThread={activeThread ?? null}
      />

      {/* MCP Permission Modal */}
      {mcpRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <ShieldAlert className="text-red-600 dark:text-red-400" size={24} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Security Alert</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              The application is requesting permission to <strong>{mcpRequest.action}</strong> the following path via Model Context Protocol:
              <br/><br/>
              <code className="bg-gray-100 dark:bg-[#131314] px-2 py-1 rounded text-sm break-all">
                {mcpRequest.path}
              </code>
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => handleMcpResponse(false)}
                className="flex-1 py-2 px-4 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Deny
              </button>
              <button
                onClick={() => handleMcpResponse(true)}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const renderCompactShell = () => (
    <>
      {renderSkipLink()}
      <OfflineIndicator />
      <button
        ref={compactMenuButtonRef}
        id="compact-menu-button"
        type="button"
        className="mobile-hamburger"
        aria-label={mobileSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        aria-controls="compact-sidebar"
        aria-expanded={mobileSidebarOpen}
        onClick={mobileSidebarOpen ? closeMobileSidebar : openMobileSidebar}
      >
        <Menu size={20} />
      </button>

      {mobileSidebarOpen && (
        <div
          aria-hidden="true"
          className="shell-overlay-backdrop mobile-backdrop"
          onClick={closeMobileSidebar}
        />
      )}

      <div
        id="compact-sidebar"
        className={`mobile-sidebar-wrap compact-sidebar-sheet ${mobileSidebarOpen ? 'open' : ''}`}
        aria-hidden={!mobileSidebarOpen}
      >
        {renderSidebar(true, setNavDrawerOpen)}
      </div>

      {renderChat()}

      {activeArtifact && (
        <>
          <div
            aria-hidden="true"
            className="shell-overlay-backdrop compact-canvas-backdrop"
            onClick={closeCanvasPanel}
          />
          <div className="compact-canvas-sheet" role="dialog" aria-modal="true" aria-label="Artifact canvas">
            {renderCanvas(true, setCanvasDrawerOpen)}
          </div>
        </>
      )}
    </>
  );

  const renderMediumShell = () => (
    <>
      {renderSkipLink()}
      <OfflineIndicator />
      <div className="tablet-sidebar-pane">
        {renderSidebar(true, () => undefined)}
      </div>
      {renderChat()}
      {activeArtifact && (
        <>
          <div
            aria-hidden="true"
            className="shell-overlay-backdrop tablet-canvas-backdrop"
            onClick={closeCanvasPanel}
          />
          <div className="tablet-canvas-sheet" role="dialog" aria-modal="true" aria-label="Artifact canvas">
            {renderCanvas(true, () => undefined)}
          </div>
        </>
      )}
    </>
  );

  const renderExpandedShell = () => (
    <>
      {renderSkipLink()}
      <OfflineIndicator />
      {renderSidebar(navDrawerOpen, setNavDrawerOpen)}
      {renderChat()}
      {renderCanvas(canvasDrawerOpen, setCanvasDrawerOpen)}
    </>
  );

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  return (
    <div
      data-shell-mode={shellMode}
      className={`app-shell shell-${shellMode} bg-white dark:bg-[#131314] text-gray-900 dark:text-gray-100 font-sans ${
        shellMode === 'expanded' ? 'grid transition-[grid-template-columns] duration-300 ease-in-out' : ''
      }`}
      style={shellMode === 'expanded' ? {
        gridTemplateColumns: `${navDrawerOpen ? navRailOpenWidth : `${navRailClosedWidth}px`} minmax(0, 1fr) ${canvasDrawerOpen ? canvasRailOpenWidth : `${canvasRailClosedWidth}px`}`,
      } : undefined}
    >
      {shellMode === 'compact' && renderCompactShell()}
      {shellMode === 'medium' && renderMediumShell()}
      {shellMode === 'expanded' && renderExpandedShell()}
      {renderSharedOverlays()}
    </div>
  );
}
