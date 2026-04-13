const fs = require('fs');
const path = require('path');

const basePath = '/Volumes/SanDisk1Tb/GEMINI for MacOS/src';

function patchFile(relativePath, patcher) {
    const fullPath = path.join(basePath, relativePath);
    if (!fs.existsSync(fullPath)) {
        console.error(`File not found: ${fullPath}`);
        return;
    }
    let content = fs.readFileSync(fullPath, 'utf8');
    content = patcher(content);
    fs.writeFileSync(fullPath, content);
    console.log(`Patched ${relativePath}`);
}

// 1. main.tsx
patchFile('main.tsx', (code) => {
    if(!code.includes('ToastProvider')) {
        code = `import { ToastProvider } from './components/Toast';\n` + code;
        code = code.replace('<App />', '<ToastProvider><App /></ToastProvider>');
    }
    return code;
});

// 2. App.tsx
patchFile('App.tsx', (code) => {
    const imports = `
import { Search } from "./components/Search";
import { CommandPalette } from "./components/CommandPalette";
import { Help } from "./components/Help";
import { Plugins } from "./components/Plugins";
import { LiveMode } from "./components/LiveMode";
import { Integrations } from "./components/Integrations";
import { ShortcutEditor } from "./components/ShortcutEditor";
import { useKeyboardShortcuts } from "./lib/useKeyboardShortcuts";
import { setupAutosave } from "./lib/autosave";
import { windowState } from "./lib/windowState";
import { Search as SearchIcon, Plus, Moon, Sun, Settings as SettingsIcon, Camera, Link, Library, Puzzle, Keyboard } from "lucide-react";
`;
    if (!code.includes('import { Search }')) {
        code = code.replace("import { ShieldAlert } from 'lucide-react';", "import { ShieldAlert } from 'lucide-react';" + imports);
    }
    
    code = code.replace(
        /const \[theme, setTheme\] = useState<'light' \| 'dark'>\('dark'\);/,
        `const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = windowState.load().theme;
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });`
    );

    if (!code.includes('showSearch')) {
        code = code.replace(
            /const \[showArtifacts, setShowArtifacts\] = useState\(false\);/,
            `const [showArtifacts, setShowArtifacts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const [showShortcutEditor, setShowShortcutEditor] = useState(false);
  const [showLiveMode, setShowLiveMode] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [tabbedThreads, setTabbedThreads] = useState<string[]>([]);`
        );
    }

    if (!code.includes('setupAutosave')) {
        code = code.replace(
            /initStorage\(\);\n  \}, \[\]\);/,
            `initStorage();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);
    
    const autosave = setupAutosave(() => ({ threads, activeThreadId, activeArtifact }));
    autosave.start();

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      autosave.stop();
    };
  }, []);`
        );
    }
    
    code = code.replace(
      /document\.documentElement\.classList\.remove\('dark'\);\n    \}/,
      `document.documentElement.classList.remove('dark');
    }
    windowState.save({ theme });`
    );

    if (!code.includes('paletteActions')) {
        code = code.replace(
            /const activeThread = threads\.find\(t => t\.id === activeThreadId\);/,
            `const paletteActions = [
    { label: "New Chat", icon: <Plus size={16} />, shortcut: "Cmd+N", action: handleNewThread },
    { label: "Search", icon: <SearchIcon size={16} />, shortcut: "Cmd+K", action: () => setShowSearch(true) },
    { label: "Settings", icon: <SettingsIcon size={16} />, shortcut: "Cmd+,", action: () => setShowSettings(true) },
    { label: "Live Mode", icon: <Camera size={16} />, shortcut: "Cmd+L", action: () => setShowLiveMode(true) },
    { label: "Toggle Theme", icon: theme === "dark" ? <Sun size={16} /> : <Moon size={16} />, shortcut: "Cmd+T", action: () => setTheme(theme === "dark" ? "light" : "dark") },
    { label: "Plugins", icon: <Puzzle size={16} />, shortcut: "Cmd+Shift+P", action: () => setShowPlugins(true) },
  ];

  const shortcuts = {
    "cmd+n": handleNewThread,
    "cmd+k": () => setShowSearch(true),
    "cmd+shift+p": () => setShowCommandPalette(true),
    "cmd+,": () => setShowSettings(true),
    "cmd+t": () => setTheme(theme === "dark" ? "light" : "dark"),
    "cmd+l": () => setShowLiveMode(true),
    "f1": () => setShowHelp(true),
  };
  useKeyboardShortcuts(shortcuts);

  const activeThread = threads.find(t => t.id === activeThreadId);`
        );
    }

    if (!code.includes('onOpenLiveMode')) {
        code = code.replace(
            /onOpenArtifacts=\{\(\) => setShowArtifacts\(true\)\}/,
            `onOpenArtifacts={() => setShowArtifacts(true)}
        onOpenLiveMode={() => setShowLiveMode(true)}
        onOpenIntegrations={() => setShowIntegrations(true)}
        onOpenPlugins={() => setShowPlugins(true)}
        onOpenHelp={() => setShowHelp(true)}
        onOpenShortcutEditor={() => setShowShortcutEditor(true)}
        tabbedThreads={tabbedThreads}
        onAddTab={(id) => setTabbedThreads(prev => [...new Set([...prev, id])])}
        onRemoveTab={(id) => setTabbedThreads(prev => prev.filter(t => t !== id))}`
        );
    }

    if (!code.includes('showSearch &&')) {
        code = code.replace(
            /\{showArtifacts && <ArtifactLibrary([^>]+)>\}/,
            `{showArtifacts && <ArtifactLibrary$1>}
      {showSearch && <Search onClose={() => setShowSearch(false)} onOpenThread={(id) => setActiveThreadId(id)} onOpenArtifact={(a) => setActiveArtifact(a)} />}
      {showCommandPalette && <CommandPalette onClose={() => setShowCommandPalette(false)} actions={paletteActions} />}
      {showHelp && <Help onClose={() => setShowHelp(false)} />}
      {showPlugins && <Plugins onClose={() => setShowPlugins(false)} />}
      {showShortcutEditor && <ShortcutEditor onClose={() => setShowShortcutEditor(false)} shortcuts={shortcuts} />}
      {showLiveMode && <LiveMode onClose={() => setShowLiveMode(false)} />}
      {showIntegrations && <Integrations onClose={() => setShowIntegrations(false)} />}`
        );
    }

    code = code.replace(
        /className="flex-1 flex relative"/,
        'className="flex-1 flex relative" role="main" aria-label="Main chat area"'
    );

    return code;
});

// 3. Sidebar.tsx
patchFile('components/Sidebar.tsx', (code) => {
    if (!code.includes('onOpenLiveMode')) {
        code = code.replace(
            /import \{ Plus, MessageSquare, Settings, Link as LinkIcon, Calendar, Diamond, Library \} from 'lucide-react';/,
            `import { Plus, MessageSquare, Settings, Link as LinkIcon, Calendar, Diamond, Library, Video, Puzzle, HelpCircle, Keyboard } from 'lucide-react';`
        );
        code = code.replace(
            /onOpenArtifacts: \(\) => void;/g,
            `onOpenArtifacts: () => void;\n  onOpenLiveMode: () => void;\n  onOpenIntegrations: () => void;\n  onOpenPlugins: () => void;\n  onOpenHelp: () => void;\n  onOpenShortcutEditor: () => void;\n  tabbedThreads?: string[];\n  onAddTab?: (id: string) => void;\n  onRemoveTab?: (id: string) => void;`
        );
        code = code.replace(
            /onOpenPI, onOpenArtifacts \}: SidebarProps/,
            `onOpenPI, onOpenArtifacts, onOpenLiveMode, onOpenIntegrations, onOpenPlugins, onOpenHelp, onOpenShortcutEditor }: SidebarProps`
        );
        code = code.replace(
            /className="w-\\[250px\\] bg-gray-50 dark:bg-\\[#1e1f20\\] border-r border-gray-200 dark:border-gray-800 flex flex-col h-full"/,
            `className="w-[250px] bg-gray-50 dark:bg-[#1e1f20] border-r border-gray-200 dark:border-gray-800 flex flex-col h-full" role="navigation" aria-label="Sidebar navigation"`
        );
        const buttons = `
        <button onClick={onOpenLiveMode} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Video size={16} /> <span>Live Mode</span>
        </button>
        <button onClick={onOpenIntegrations} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <LinkIcon size={16} /> <span>Google Ecosystem</span>
        </button>
        <button onClick={onOpenPlugins} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Puzzle size={16} /> <span>Plugins</span>
        </button>
        <button onClick={onOpenShortcutEditor} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Keyboard size={16} /> <span>Shortcuts</span>
        </button>
        <button onClick={onOpenHelp} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <HelpCircle size={16} /> <span>Help & Docs</span>
        </button>`;
        code = code.replace(
            /<button onClick=\{onOpenSettings\}/,
            buttons + '\n        <button onClick={onOpenSettings}'
        );
    }
    return code;
});

// 4. Chat.tsx
patchFile('components/Chat.tsx', (code) => {
    if (!code.includes('isDragging')) {
        code = code.replace(
            /import \{ Send, Mic, Image as ImageIcon, Video, Play, Square \} from 'lucide-react';/,
            `import { Send, Mic, Image as ImageIcon, Video, Play, Square, Upload } from 'lucide-react';`
        );
        code = code.replace(
            /const \[input, setInput\] = useState\(''\);/,
            `const [input, setInput] = useState('');\n  const [isDragging, setIsDragging] = useState(false);`
        );
        code = code.replace(
            /const handleSubmit = \(e: React\.FormEvent\) => \{/,
            `const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };

  const handleSubmit = (e: React.FormEvent) => {`
        );
        code = code.replace(
            /<div className="flex-1 flex flex-col h-full bg-white dark:bg-\\[#131314\\]">/,
            `<div className="flex-1 flex flex-col h-full bg-white dark:bg-[#131314] relative" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>`
        );
        code = code.replace(
            /<div className="flex-1 overflow-y-auto p-4 space-y-6">/,
            `{isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-4 border-dashed border-blue-500 rounded-2xl m-4 pointer-events-none">
          <Upload size={48} className="text-blue-500 mb-2 animate-bounce" />
          <p className="text-blue-700 dark:text-blue-300 font-bold text-xl">Drop files to upload</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-6" role="log" aria-live="polite">`
        );
    }
    return code;
});

// 5. Canvas.tsx
patchFile('components/Canvas.tsx', (code) => {
    if (!code.includes('useHistory')) {
        code = code.replace(
            /import \{ useState, useEffect, useRef \} from 'react';/,
            `import { useState, useEffect, useRef } from 'react';
import { useHistory } from '../lib/useHistory';
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts';
import { exportArtifact } from '../lib/export';
import { clipboard } from '../lib/clipboard';`
        );
        code = code.replace(
            /import \{ X, Code, FileText, Search, Check, Wand2, Volume2, Music, Video, RefreshCw, AlignLeft, Terminal \} from 'lucide-react';/,
            `import { X, Code, FileText, Search, Check, Wand2, Volume2, Music, Video, RefreshCw, AlignLeft, Terminal, Download, Copy, Undo, Redo } from 'lucide-react';`
        );
        code = code.replace(
            /const \[content, setContent\] = useState\(artifact\?\.content \|\| ''\);/,
            `const history = useHistory(artifact?.content || '');
  const content = history.value;
  const setContent = history.push;
  
  useKeyboardShortcuts({
    'cmd+z': history.undo,
    'cmd+shift+z': history.redo,
    'cmd+s': handleSave
  });`
        );
        
        const undoRedo = `
          <div className="flex items-center gap-1 mr-2 border-r border-gray-200 dark:border-gray-700 pr-2">
            <button onClick={history.undo} disabled={!history.canUndo} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md disabled:opacity-30" title="Undo (Cmd+Z)"><Undo size={16} /></button>
            <button onClick={history.redo} disabled={!history.canRedo} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md disabled:opacity-30" title="Redo (Cmd+Shift+Z)"><Redo size={16} /></button>
            <button onClick={() => exportArtifact(artifact, 'txt')} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md" title="Export"><Download size={16} /></button>
            <button onClick={() => clipboard.copyAsMarkdown(content, artifact?.title || 'artifact')} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md" title="Copy"><Copy size={16} /></button>
          </div>`;
        code = code.replace(
            /<div className="relative">/,
            undoRedo + '\n          <div className="relative">'
        );
    }
    return code;
});

// 6. Settings.tsx
patchFile('components/Settings.tsx', (code) => {
    if (!code.includes('backup.createSnapshot')) {
        code = code.replace(
            /import \{ X \} from 'lucide-react';/,
            `import { X, Download, Upload } from 'lucide-react';
import { backup } from '../lib/backup';`
        );
        const advancedSection = `
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Model Parameters</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Temperature</span><span>0.7</span></div>
                <input type="range" min="0" max="1" step="0.1" defaultValue="0.7" className="w-full" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Top-P</span><span>0.95</span></div>
                <input type="range" min="0" max="1" step="0.05" defaultValue="0.95" className="w-full" />
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Data & Backup</h3>
            <div className="flex gap-2">
              <button onClick={() => backup.createSnapshot()} className="flex-1 py-2 px-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm">
                <Download size={16} /> Export Backup
              </button>
            </div>
          </div>`;
        code = code.replace(
            /<\/div>\n      <\/div>\n    <\/div>/,
            advancedSection + '\n        </div>\n      </div>\n    </div>'
        );
    }
    return code;
});

// 7. ArtifactLibrary.tsx
patchFile('components/ArtifactLibrary.tsx', (code) => {
    if (!code.includes('Import File')) {
        code = code.replace(
            /import \{ X, Search, FileText, Code \} from 'lucide-react';/,
            `import { X, Search, FileText, Code, Upload } from 'lucide-react';`
        );
        code = code.replace(
            /<h2 className="text-xl font-semibold text-gray-900 dark:text-white">Artifact Library<\/h2>/,
            `<div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Artifact Library</h2>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
              <Upload size={14} /> Import File
            </button>
          </div>`
        );
    }
    return code;
});

