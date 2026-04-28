import React, { useEffect, useRef } from 'react';
import shaka from 'shaka-player/dist/shaka-player.ui';
import 'shaka-player/dist/controls.css';
import { Channel } from '../lib/m3uParser';
import { Loader2, Tv } from 'lucide-react';

interface PlayerProps {
  channel: Channel | null;
}

export default function Player({ channel }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<shaka.Player | null>(null);
  const uiRef = useRef<shaka.ui.Overlay | null>(null);

  useEffect(() => {
    if (!videoRef.current || !videoContainerRef.current) return;

    // Initialize player
    const player = new shaka.Player(videoRef.current);
    playerRef.current = player;
    
    // Initialize UI
    const ui = new shaka.ui.Overlay(player, videoContainerRef.current, videoRef.current);
    uiRef.current = ui;
    
    // Optional UI config
    ui.configure({
      controlPanelElements: [
        'play_pause', 'time_and_duration', 'spacer', 'mute', 'volume', 'fullscreen', 'overflow_menu'
      ]
    });

    // Cleanup
    return () => {
      player.destroy();
      ui.destroy();
    };
  }, []);

  useEffect(() => {
    const loadChannel = async () => {
      const player = playerRef.current;
      if (!player) return;

      if (!channel) {
        await player.unload();
        return;
      }

      try {
        // Configure DRM if needed
        if (channel.licenseKey) {
          const isClearKey = channel.licenseType?.toLowerCase() === 'clearkey';
          
          if (isClearKey) {
             // Basic Clearkey license server config
             player.configure({
                drm: {
                  servers: {
                    'org.w3.clearkey': channel.licenseKey
                  }
                }
             });
          } else {
             // Default to Widevine/PlayReady
             player.configure({
                drm: {
                  servers: {
                    'com.widevine.alpha': channel.licenseKey,
                    'com.microsoft.playready': channel.licenseKey
                  }
                }
             });
          }
        } else {
          // Reset DRM if none
          player.configure({ drm: { servers: {} } });
        }

        await player.load(channel.url);
        videoRef.current?.play();
      } catch (e) {
        console.error('Error loading channel', e);
      }
    };

    loadChannel();
  }, [channel]);

  if (!channel) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 backdrop-blur-md text-gray-400 rounded-2xl border border-white/5 shadow-2xl">
        <Tv className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg font-medium">Select a channel to start watching</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/10 group">
      <div ref={videoContainerRef} className="w-full h-full" style={{ maxWidth: '100%' }}>
        <video 
          ref={videoRef} 
          className="w-full h-full" 
          autoPlay 
          controls={false}
          style={{ maxWidth: '100%' }}
        />
      </div>
      
      {/* Absolute overlay when playing to show minimal channel info briefly on hover */}
      <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 flex items-center justify-between">
         <div className="flex items-center gap-4">
           {channel.logo && (
              <img src={channel.logo} alt={channel.name} className="w-12 h-12 object-contain bg-white/10 rounded-lg p-1 backdrop-blur-md" />
           )}
           <div>
             <h2 className="text-white text-xl font-bold tracking-tight drop-shadow-md">{channel.name}</h2>
             {channel.group && <p className="text-white/70 text-sm font-medium tracking-wider uppercase">{channel.group}</p>}
           </div>
         </div>
      </div>
    </div>
  );
}
