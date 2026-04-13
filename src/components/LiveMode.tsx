import { useState, useRef } from 'react';
import { X, Camera, Monitor, VideoOff } from 'lucide-react';
import { multimodal } from '../lib/multimodal';

export function LiveMode({ onClose }) {
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);

  const startCamera = async () => {
    if (videoRef.current) {
      const s = await multimodal.startCameraStream(videoRef.current);
      if (s) setStream(s);
    }
  };

  const startScreen = async () => {
    if (videoRef.current) {
      const s = await multimodal.startScreenShare(videoRef.current);
      if (s) setStream(s);
    }
  };

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
      <div className="bg-[#1e1f20] rounded-2xl w-full max-w-4xl h-full max-h-[600px] flex flex-col shadow-2xl relative overflow-hidden border border-gray-800">
        <div className="flex justify-between items-center p-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <h2 className="text-xl font-semibold text-white">Live Mode</h2>
          </div>
          <button onClick={() => { stopStream(); onClose(); }} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 bg-black flex items-center justify-center relative">
          {!stream ? (
            <div className="text-gray-500 text-center flex flex-col items-center gap-4">
              <Camera size={48} />
              <p>Select a source to begin live streaming</p>
            </div>
          ) : (
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
          )}
        </div>
        <div className="p-6 border-t border-gray-800 flex justify-center gap-4">
          {!stream ? (
            <>
              <button onClick={startCamera} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full transition-all">
                <Camera size={20} /> Start Camera
              </button>
              <button onClick={startScreen} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-full transition-all">
                <Monitor size={20} /> Share Screen
              </button>
            </>
          ) : (
            <button onClick={stopStream} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-full transition-all">
              <VideoOff size={20} /> Stop Stream
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
