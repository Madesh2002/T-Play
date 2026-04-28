import React, { useState, useMemo } from 'react';
import { Channel } from '../lib/m3uParser';
import { Search, MonitorPlay, Layers, Tv } from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  channels: Channel[];
  onSelectChannel: (channel: Channel) => void;
  selectedChannelId?: string;
}

export default function Sidebar({ channels, onSelectChannel, selectedChannelId }: SidebarProps) {
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');

  const groups = useMemo(() => {
    const groupSet = new Set<string>();
    channels.forEach(c => {
      if (c.group) groupSet.add(c.group);
    });
    return ['All', ...Array.from(groupSet).sort()];
  }, [channels]);

  const filteredChannels = useMemo(() => {
    return channels.filter(c => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
      const matchGroup = selectedGroup === 'All' || c.group === selectedGroup;
      return matchSearch && matchGroup;
    });
  }, [channels, search, selectedGroup]);

  return (
    <div className="w-[340px] flex-shrink-0 h-full bg-black/40 backdrop-blur-3xl border-r border-white/5 flex flex-col pt-4">
      
      {/* Header */}
      <div className="px-6 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e50914] to-[#ff3e4d] flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/20">
            <MonitorPlay className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold tracking-tight text-xl leading-tight">T-PLAY</h1>
            <p className="text-[#ff3e4d] text-xs font-semibold tracking-wider uppercase mt-0.5">{channels.length} Channels</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-5 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search channels..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#ff3e4d] focus:bg-white/10 transition-all font-medium"
          />
        </div>
      </div>

      {/* Categories Horizontal Scroll */}
      <div className="px-5 mb-2 h-[42px] flex-shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-none mask-fade-edges">
          {groups.map(group => (
            <button
              key={group}
              onClick={() => setSelectedGroup(group)}
              className={cn(
                "whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-all border",
                selectedGroup === group 
                  ? "bg-white text-black border-white shadow-md"
                  : "bg-white/5 text-white/60 border-transparent hover:bg-white/10 hover:text-white"
              )}
            >
              {group}
            </button>
          ))}
        </div>
      </div>

      {/* Channel List */}
      <div className="flex-1 overflow-y-auto px-3 pb-6 custom-scrollbar">
        {filteredChannels.length === 0 ? (
           <div className="text-center mt-12 px-6">
             <Layers className="w-10 h-10 text-white/20 mx-auto mb-3" />
             <p className="text-white/40 text-sm font-medium">No channels found for your search criteria.</p>
           </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredChannels.map(channel => (
              <button
                key={channel.id}
                onClick={() => onSelectChannel(channel)}
                className={cn(
                  "flex items-center gap-4 w-full p-3 rounded-xl transition-all text-left group",
                  selectedChannelId === channel.id
                    ? "bg-gradient-to-r from-[#e50914]/20 to-transparent border border-[#e50914]/30"
                    : "hover:bg-white/5 border border-transparent"
                )}
              >
                {/* Logo wrapper */}
                <div className="w-[60px] h-[40px] flex-shrink-0 bg-black/60 rounded-lg p-1 flex items-center justify-center border border-white/5 group-hover:border-white/10 transition-colors">
                  {channel.logo ? (
                     <img src={channel.logo} alt={channel.name} className="w-full h-full object-contain" />
                  ) : (
                     <Tv className="w-5 h-5 text-white/20" />
                  )}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className={cn(
                    "text-sm font-bold truncate transition-colors",
                    selectedChannelId === channel.id ? "text-white" : "text-white/80 group-hover:text-white"
                  )}>
                    {channel.name}
                  </h3>
                  {channel.group && (
                    <p className="text-xs text-[#ff3e4d] font-medium tracking-wide uppercase truncate mt-0.5">
                      {channel.group}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
