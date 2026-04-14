import { useEffect, useRef, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Failsafe in case video fails to load or ends without firing event
      onComplete();
    }, 9000); // 8 second video + 1s buffer

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
      {error ? (
        <div className="text-white text-center">
          <img src="/logo.png" alt="Gemini Logo" className="w-32 h-32 mx-auto mb-4 animate-pulse" />
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            Loading Gemini...
          </h1>
        </div>
      ) : (
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          // Sound is explicitly allowed based on user request. 
          // Note: Browsers may block this until a user gesture occurs.
          muted={false} 
          onEnded={onComplete}
          onError={() => setError(true)}
          className="w-full h-full object-cover"
        >
          <source src="/splash.mp4" type="video/mp4" />
          <source src="/splash.mov" type="video/quicktime" />
          Your browser does not support the video tag.
        </video>
      )}
    </div>
  );
}
