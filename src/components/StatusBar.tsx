import { useState, useEffect } from 'react';
import { Cpu, Activity, Zap } from 'lucide-react';

export function StatusBar() {
  const [cpu, setCpu] = useState(24);
  const [latency, setLatency] = useState(115);

  useEffect(() => {
    const interval = setInterval(() => {
      setCpu(Math.floor(Math.random() * 20 + 10));
      setLatency(Math.floor(Math.random() * 50 + 80));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-8 bg-gray-50 dark:bg-[#131314] border-t border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 text-[10px] font-medium text-gray-500 dark:text-gray-400 select-none uppercase tracking-widest">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Cpu size={12} className="text-blue-500" />
          <span>CPU: {cpu}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity size={12} className="text-green-500" />
          <span>Latency: {latency}ms</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Zap size={12} className="text-amber-500" />
          <span>Flash 2.0 Ready</span>
        </div>
      </div>
    </div>
  );
}
