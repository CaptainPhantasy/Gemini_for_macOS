import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Chat } from './components/Chat';
import { Canvas } from './components/Canvas';
import { PersonalIntelligencePopup } from './components/PersonalIntelligence';
import { Settings } from './components/Settings';
import { GemsRegistry } from './components/GemsRegistry';
import { ScheduledActions } from './components/ScheduledActions';
import { ArtifactLibrary } from './components/ArtifactLibrary';
import { Thread, Message, Artifact, AppSettings } from './types';
import { storage } from './lib/storage';
import { mcpClient } from './lib/mcp';
import { buildAgentSystemPrompt, parseToolRequest } from './lib/agent-tools';
import { autoSyncArtifact } from './lib/drive-sync';
import { v4 as uuidv4 } from 'uuid';
import { getAI } from './lib/api-config';
import { SplashScreen } from './components/SplashScreen';
import { ShieldAlert } from 'lucide-react';
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
import { costLedger } from "./lib/cost-ledger";
import { logger } from "./lib/logger";
import { Search as SearchIcon, Plus, Moon, Sun, Settings as SettingsIcon, Camera, Menu } from "lucide-react";

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
  const [settings, setSettings] = useState<AppSettings>(storage.getSettings());

  // Mobile sidebar drawer state. The CSS in index.css handles the slide-in
  // animation and only activates below 768px — on desktop this state is a
  // no-op because `.mobile-sidebar-wrap` collapses to `display: contents`.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const closeMobileSidebar = () => setMobileSidebarOpen(false);
  // Wrap any sidebar callback so picking an item also closes the drawer.
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

  useEffect(() => {
    // Register MCP permission handler
    mcpClient.setPermissionHandler(async (action, path) => {
      if (settings.autonomyMode === 'yolo') {
        return true;
      }
      
      if (settings.autonomyMode === 'risk-based' && action === 'READ') {
        return true;
      }
      
      if (settings.autonomyMode === 'scoped') {
        const isScoped = settings.scopedPaths.some(p => path.startsWith(p));
        if (isScoped) return true;
      }

      return new Promise((resolve) => {
        setMcpRequest({ action, path, resolve });
      });
    });
  }, [settings.autonomyMode, settings.scopedPaths]);

  useEffect(() => {
    const initStorage = async () => {
      await storage.init();
      const currentSettings = storage.getSettings();
      setSettings(currentSettings);
      mcpClient.updateServers(currentSettings.mcpServers);
      
      const loadedThreads = storage.getThreads();
      setThreads([...loadedThreads]);
      if (loadedThreads.length > 0) {
        setActiveThreadId(loadedThreads[0].id);
      } else {
        handleNewThread();
      }
    };
    initStorage();
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'theme-gemini');
    
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'gemini') {
      document.documentElement.classList.add('dark', 'theme-gemini');
    }
    
    windowState.save({ theme: theme as 'light' | 'dark' | 'system' | 'gemini' });
  }, [theme]);

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
    if (!activeThread) return;

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now()
    };

    const updatedMessages = [...activeThread.messages, userMsg];
    
    const updatedThread = {
      ...activeThread,
      messages: updatedMessages,
      title: activeThread.messages.length === 0 ? content.slice(0, 30) + '...' : activeThread.title,
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
      const activeGem = activeThread.gemId ? gems.find(g => g.id === activeThread.gemId) : null;

      // Tool-aware system prompt — teaches the model about Desktop Commander MCP
      // capabilities, its persistent memory directory, and the Tool:/Args: protocol
      // that parseToolRequest understands.
      const tools = mcpClient.getAvailableTools();
      const toolPrompt = buildAgentSystemPrompt(tools);
      const memoryNotice =
        `PERSISTENT MEMORY:\n` +
        `You have a durable memory directory at ` +
        `"/Volumes/SanDisk1Tb/GEMINI for MacOS/.gemini-memory/". ` +
        `Use read_file on .gemini-memory/summary.md at the start of a task to ` +
        `restore prior context, and write_file to update it with durable facts. ` +
        `Never store secrets there. See .gemini-memory/README.md for layout.`;
      const systemInstruction = [activeGem?.systemInstruction, toolPrompt, memoryNotice, userPrefs]
        .filter(Boolean)
        .join('\n\n');

      // Conversation history — send the full thread so the model does not
      // "lose context" between turns. Map our Message shape to Gemini content parts.
      // When an attachment is present, include it as inlineData on the last user message.
      const historyContents = updatedMessages.map((m, i) => {
        const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: m.content }];
        if (attachment && i === updatedMessages.length - 1 && m.role === 'user') {
          const base64 = attachment.dataUri.split(',')[1];
          if (base64) {
            parts.push({ inlineData: { mimeType: attachment.mimeType, data: base64 } });
          }
        }
        return { role: m.role === 'model' ? 'model' : 'user', parts };
      });

      const ai = await getAI();
      console.log('Sending message to model with history:', historyContents.length, 'turns');
      const textModel = settings.models?.text ?? 'gemini-3.1-pro-preview';

      // Tool-call loop: allow the model to emit Tool:/Args: blocks, execute them
      // via MCP, and feed results back. Cap at 5 iterations to avoid runaway loops.
      const workingContents: Array<{ role: string; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [
        ...historyContents,
      ];
      let response: any;
      let responseText = '';
      for (let iter = 0; iter < 5; iter++) {
        response = await ai.models.generateContent({
          model: textModel,
          contents: workingContents,
          config: {
            systemInstruction: systemInstruction.trim() ? systemInstruction : undefined,
            thinkingConfig: settings.thinkingBudgets?.text
              ? { thinkingBudget: settings.thinkingBudgets.text }
              : undefined,
            tools: settings.searchEnabled
              ? [{ googleSearch: {} }]
              : undefined,
          },
        });
        const textOrFn: any = (response as any).text;
        responseText = typeof textOrFn === 'function' ? textOrFn() : textOrFn || '';

        const toolReq = parseToolRequest(responseText);
        if (!toolReq) break;

        try {
          const toolResult = await mcpClient.executeTool(toolReq.toolName, toolReq.args);
          const resultText =
            typeof toolResult === 'string'
              ? toolResult
              : JSON.stringify(toolResult, null, 2);
          workingContents.push(
            { role: 'model', parts: [{ text: responseText }] },
            {
              role: 'user',
              parts: [
                {
                  text: `TOOL_RESULT ${toolReq.toolName}:\n${resultText}`,
                },
              ],
            }
          );
        } catch (toolErr) {
          workingContents.push(
            { role: 'model', parts: [{ text: responseText }] },
            {
              role: 'user',
              parts: [{ text: `TOOL_ERROR ${toolReq.toolName}: ${String(toolErr)}` }],
            }
          );
        }
      }
      console.log('Final response text:', responseText);
      console.log('Response text:', responseText);

      // Phase 3b — log cost for this chat call (best-effort; never block UX on failure).
      try {
        const usage: any = (response as any).usageMetadata ?? {};
        await costLedger.record({
          timestamp: Date.now(),
          model: textModel,
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

      const finalThread = {
        ...updatedThread,
        messages: [...updatedMessages, modelMsg],
        updatedAt: Date.now()
      };

      await storage.saveThread(finalThread);
      setThreads([...storage.getThreads()]);

      // Automatically open the first artifact in the Canvas
      if (detectedArtifacts.length > 0) {
        setActiveArtifact(detectedArtifacts[0]);
      }
    } catch (error) {
      console.error('Error generating content:', error);
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleMcpResponse = (allowed: boolean) => {
    if (mcpRequest) {
      mcpRequest.resolve(allowed);
      setMcpRequest(null);
    }
  };

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-[#131314] text-gray-900 dark:text-gray-100 font-sans">
      {/* Mobile hamburger — hidden on desktop via CSS media query. */}
      <button
        type="button"
        className="mobile-hamburger"
        aria-label="Open sidebar"
        onClick={() => setMobileSidebarOpen(true)}
      >
        <Menu size={20} />
      </button>

      {/* Mobile backdrop — only rendered when drawer is open. Desktop CSS
          hides it unconditionally. */}
      {mobileSidebarOpen && (
        <div
          role="presentation"
          className="mobile-backdrop"
          onClick={closeMobileSidebar}
        />
      )}

      <div className={`mobile-sidebar-wrap ${mobileSidebarOpen ? 'open' : ''}`}>
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
        />
      </div>
      
      <div className="flex-1 flex relative" role="main" aria-label="Main chat area">
        <Chat
          messages={activeThread?.messages || []}
          onSendMessage={handleSendMessage}
          onOpenArtifact={(artifact) => setActiveArtifact(artifact)}
          gems={storage.getGems().map(g => ({ id: g.id, name: g.name }))}
          activeGemId={activeThread?.gemId}
          onSetGem={handleSetGem}
        />
        
        {activeArtifact && (
          <Canvas
            artifact={activeArtifact}
            onClose={() => setActiveArtifact(null)}
            settings={settings}
          />
        )}
      </div>

      {showPI && <PersonalIntelligencePopup onClose={() => setShowPI(false)} />}
      {showSettings && <Settings onClose={() => setShowSettings(false)} settings={settings} onUpdateSettings={handleUpdateSettings} />}
      {showGems && <GemsRegistry onClose={() => setShowGems(false)} />}
      {showSchedule && <ScheduledActions onClose={() => setShowSchedule(false)} />}
      {showArtifacts && <ArtifactLibrary onClose={() => setShowArtifacts(false)} onOpenArtifact={(artifact) => { setActiveArtifact(artifact); setShowArtifacts(false); }} />}
      {showSearch && <Search onClose={() => setShowSearch(false)} onOpenThread={(id) => setActiveThreadId(id)} onOpenArtifact={(a) => setActiveArtifact(a)} />}
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
    </div>
  );
}
