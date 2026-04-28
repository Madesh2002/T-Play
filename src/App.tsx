import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Player from './components/Player';
import { Channel, parseM3U } from './lib/m3uParser';
import { Settings, Link as LinkIcon, Loader2, LogOut } from 'lucide-react';

const sampleM3U = `
#EXTM3U
#EXTINF:-1 tvg-id="ts1" tvg-logo="https://raw.githubusercontent.com/shaka-project/shaka-player/main/docs/shaka-player-logo.png" group-title="Test",Tears of Steel (DASH)
https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd
`;

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'MOBILE' | 'OTP' | 'LOGGED_IN'>('MOBILE');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    checkLogin();
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const checkLogin = async () => {
    try {
       const res = await fetch('/api/check_login');
       const data = await res.json();
       if (data.exists) {
          setIsLoggedIn(true);
          setStep('LOGGED_IN');
          loadTataPlayPlaylist();
       } else {
          setChannels(parseM3U(sampleM3U));
       }
    } catch(e) {
       setChannels(parseM3U(sampleM3U));
    }
  };

  const loadTataPlayPlaylist = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/playlist.m3u');
      if (!response.ok) throw new Error('Failed to fetch playlist or login required');
      const text = await response.text();
      const parsed = parseM3U(text);
      if (parsed.length > 0) {
        setChannels(parsed);
        setSelectedChannel(null);
        setIsModalOpen(false);
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Unknown error loading playlist');
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(mobile)) {
       setError("Enter a valid 10-digit mobile number");
       return;
    }
    setLoading(true);
    setError('');
    try {
       const res = await fetch('/api/send_otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile })
       });
       const msg = await res.text();
       if (res.ok && msg.toLowerCase().includes("successfully")) {
          setStep('OTP');
          setCountdown(60);
       } else {
          setError(msg);
       }
    } catch (e: any) {
       setError("Network error");
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (!otp) {
       setError("Enter OTP");
       return;
    }
    setLoading(true);
    setError('');
    try {
       const res = await fetch('/api/verify_otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile, otp })
       });
       const msg = await res.text();
       if (res.ok && msg.toLowerCase().includes("successful")) {
          setIsLoggedIn(true);
          setStep('LOGGED_IN');
          await loadTataPlayPlaylist();
       } else {
          setError(msg);
       }
    } catch (e: any) {
       setError("Network error");
    }
    setLoading(false);
  };

  const logout = async () => {
     setLoading(true);
     try {
       await fetch('/api/logout', { method: 'POST' });
       setIsLoggedIn(false);
       setStep('MOBILE');
       setMobile('');
       setOtp('');
       setChannels(parseM3U(sampleM3U));
     } catch(e) {}
     setLoading(false);
  };

  return (
    <div className="flex h-screen w-full bg-mesh overflow-hidden text-white font-sans antialiased">
      <Sidebar 
        channels={channels} 
        onSelectChannel={setSelectedChannel} 
        selectedChannelId={selectedChannel?.id} 
      />
      
      <main className="flex-1 flex flex-col p-6 relative z-10 w-full overflow-hidden">
         <div className="flex justify-between items-center mb-6 pl-4">
             <div className="min-w-0">
               {selectedChannel ? (
                  <h2 className="text-2xl font-bold tracking-tight truncate drop-shadow-lg flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)] animate-pulse"></span>
                    Watching: <span className="text-white/90">{selectedChannel.name}</span>
                  </h2>
               ) : (
                  <h2 className="text-2xl font-bold tracking-tight text-white/50">No Channel Selected</h2>
               )}
             </div>
             
             <div className="flex items-center gap-3">
                 {isLoggedIn && (
                   <button 
                     onClick={logout}
                     className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors px-4 py-2 rounded-xl text-sm font-semibold tracking-wide backdrop-blur-md"
                   >
                     <LogOut className="w-4 h-4" />
                     Logout
                   </button>
                 )}
                 <button 
                   onClick={() => setIsModalOpen(true)}
                   className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 transition-colors px-4 py-2 rounded-xl text-sm font-semibold tracking-wide backdrop-blur-md"
                 >
                   <Settings className="w-4 h-4" />
                   Setup
                 </button>
             </div>
         </div>

         <div className="flex-1 rounded-2xl w-full max-w-7xl mx-auto shadow-2xl relative">
            <Player channel={selectedChannel} />
         </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl">
          <div className="bg-black/80 border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#e50914] rounded-full blur-[100px] opacity-20 pointer-events-none"></div>
            
            <h2 className="text-2xl font-bold mb-2">T-PLAY Setup</h2>
            <p className="text-white/50 text-sm mb-6 leading-relaxed">
               {step === 'LOGGED_IN' ? 'You are logged in and watching live streams.' : 'Sign in to access your Tata Play subscription streams directly.'}
            </p>
            
            <div className="space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium rounded-lg">
                  {error}
                </div>
              )}

              {step === 'MOBILE' && (
                 <div>
                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2 block">Mobile Number</label>
                    <input 
                      type="tel" 
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="10 digit number"
                      maxLength={10}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-center text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff3e4d] focus:bg-white/10 transition-colors"
                    />
                    <button 
                      onClick={sendOtp}
                      disabled={loading || !mobile}
                      className="w-full mt-4 py-3 px-4 rounded-xl font-bold bg-gradient-to-r from-[#e50914] to-[#ff3e4d] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex justify-center items-center"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Get OTP"}
                    </button>
                 </div>
              )}

              {step === 'OTP' && (
                 <div>
                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2 block text-center">Enter OTP sent to {mobile}</label>
                    <input 
                      type="text" 
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="OTP Code"
                      maxLength={6}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-center text-xl tracking-widest text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff3e4d] focus:bg-white/10 transition-colors"
                    />
                    <button 
                      onClick={verifyOtp}
                      disabled={loading || !otp}
                      className="w-full mt-4 py-3 px-4 rounded-xl font-bold bg-gradient-to-r from-[#e50914] to-[#ff3e4d] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex justify-center items-center"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & Login"}
                    </button>
                    
                    <button 
                      onClick={sendOtp}
                      disabled={countdown > 0}
                      className="w-full mt-2 py-2 text-sm text-white/50 hover:text-white transition-colors disabled:opacity-30"
                    >
                      {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
                    </button>
                 </div>
              )}

              {step === 'LOGGED_IN' && (
                  <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
                     <p className="text-sm font-semibold text-green-400 mb-2">Authenticated successfully</p>
                     <p className="text-xs text-white/50 mb-4">Your playlist URL (M3U):<br/><span className="text-white/80 select-all">{window.location.origin}/api/playlist.m3u</span></p>
                     <button 
                       onClick={() => {
                          setIsModalOpen(false);
                          if(channels.length === 0 || channels[0]?.url.includes('storage.googleapis.com')) {
                             loadTataPlayPlaylist();
                          }
                       }}
                       className="w-full py-3 px-4 rounded-xl font-bold bg-white/10 hover:bg-white/20 transition-all border border-white/10 flex justify-center items-center gap-2"
                     >
                       {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Watch TV"}
                     </button>
                  </div>
              )}

              {step !== 'LOGGED_IN' && (
                <div className="flex justify-center pt-4">
                  <button 
                    onClick={() => {
                      setIsModalOpen(false);
                      if (channels.length === 0) setChannels(parseM3U(sampleM3U));
                    }}
                    className="text-xs text-white/40 hover:text-white transition-colors underline underline-offset-4"
                  >
                    Skip and use default sample streams
                  </button>
                </div>
              )}
              
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
