import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Chat } from './components/Chat';
import { Canvas } from './components/Canvas';
import { PersonalIntelligencePopup } from './components/PersonalIntelligence';
import { Settings } from './components/Settings';
import { GemsRegistry } from './components/GemsRegistry';
import { ScheduledActions } from './components/ScheduledActions';
import { ArtifactLibrary } from './components/ArtifactLibrary';
import { Thread, Message, Artifact } from './types';
import { storage } from './lib/storage';
import { mcpClient } from './lib/mcp';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';
import { ShieldAlert } from 'lucide-react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  
  const [showPI, setShowPI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGems, setShowGems] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // MCP Permission State
  const [mcpRequest, setMcpRequest] = useState<{
    action: string;
    path: string;
    resolve: (value: boolean) => void;
  } | null>(null);

  useEffect(() => {
    // Register MCP permission handler
    mcpClient.setPermissionHandler((action, path) => {
      return new Promise((resolve) => {
        setMcpRequest({ action, path, resolve });
      });
    });

    const initStorage = async () => {
      await storage.init();
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
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const activeThread = threads.find(t => t.id === activeThreadId);

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

  const handleSendMessage = async (content: string) => {
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
      const systemInstruction = `User Preferences: ${pi.preferences}\nInstructions: ${pi.instructions}`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: content,
        config: {
          systemInstruction: systemInstruction.trim() ? systemInstruction : undefined,
        }
      });

      const modelMsg: Message = {
        id: uuidv4(),
        role: 'model',
        content: response.text || '',
        timestamp: Date.now()
      };

      const finalThread = {
        ...updatedThread,
        messages: [...updatedMessages, modelMsg],
        updatedAt: Date.now()
      };

      await storage.saveThread(finalThread);
      setThreads([...storage.getThreads()]);
    } catch (error) {
      console.error('Error generating content:', error);
    }
  };

  const handleMcpResponse = (allowed: boolean) => {
    if (mcpRequest) {
      mcpRequest.resolve(allowed);
      setMcpRequest(null);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-[#131314] text-gray-900 dark:text-gray-100 font-sans">
      <Sidebar 
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={(id) => {
          setActiveThreadId(id);
          setActiveArtifact(null);
        }}
        onNewThread={handleNewThread}
        onOpenSettings={() => setShowSettings(true)}
        onOpenGems={() => setShowGems(true)}
        onOpenSchedule={() => setShowSchedule(true)}
        onOpenPI={() => setShowPI(true)}
        onOpenArtifacts={() => setShowArtifacts(true)}
      />
      
      <div className="flex-1 flex relative">
        <Chat 
          messages={activeThread?.messages || []}
          onSendMessage={handleSendMessage}
          onOpenArtifact={(artifact) => setActiveArtifact(artifact)}
        />
        
        {activeArtifact && (
          <Canvas 
            artifact={activeArtifact} 
            onClose={() => setActiveArtifact(null)} 
          />
        )}
      </div>

      {showPI && <PersonalIntelligencePopup onClose={() => setShowPI(false)} />}
      {showSettings && <Settings onClose={() => setShowSettings(false)} theme={theme} setTheme={setTheme} />}
      {showGems && <GemsRegistry onClose={() => setShowGems(false)} />}
      {showSchedule && <ScheduledActions onClose={() => setShowSchedule(false)} />}
      {showArtifacts && <ArtifactLibrary onClose={() => setShowArtifacts(false)} onOpenArtifact={(artifact) => { setActiveArtifact(artifact); setShowArtifacts(false); }} />}

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
