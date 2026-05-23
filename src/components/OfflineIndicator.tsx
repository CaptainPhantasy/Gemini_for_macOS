"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [showReconnect, setShowReconnect] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOffline = () => { setOnline(false); setShowReconnect(false); };
    const goOnline = () => { setOnline(true); setShowReconnect(true); };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    if (!showReconnect) return;
    const id = setTimeout(() => setShowReconnect(false), 3000);
    return () => clearTimeout(id);
  }, [showReconnect]);

  if (online && !showReconnect) return null;

  const isOffline = !online;

  return (
    <div
      className={`fixed top-0 inset-x-0 z-[90] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium
        animate-[slideDown_200ms_ease-out_both]
        ${isOffline ? "bg-amber-500 text-amber-950" : "bg-emerald-500 text-emerald-950"}`}
    >
      {isOffline ? (
        <>
          <WifiOff className="h-4 w-4" />
          You&apos;re offline. Some features may be unavailable.
        </>
      ) : (
        <>
          <Wifi className="h-4 w-4" />
          Back online!
        </>
      )}
    </div>
  );
}
