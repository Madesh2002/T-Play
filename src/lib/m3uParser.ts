export interface Channel {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  licenseType?: string;
  licenseKey?: string;
}

export function parseM3U(m3u: string): Channel[] {
  const lines = m3u.split('\n');
  const channels: Channel[] = [];
  let currentChannel: Partial<Channel> = { id: Math.random().toString(36).substring(7) };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      // Parse tvg-id
      const idMatch = line.match(/tvg-id="([^"]+)"/);
      if (idMatch) currentChannel.id = idMatch[1];
      
      // Parse tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) currentChannel.logo = logoMatch[1];

      // Parse group-title
      const groupMatch = line.match(/group-title="([^"]+)"/);
      if (groupMatch) currentChannel.group = groupMatch[1];

      // Parse name (after the comma)
      const nameMatch = line.split(',');
      if (nameMatch.length > 1) {
        currentChannel.name = nameMatch[nameMatch.length - 1].trim();
      } else {
        currentChannel.name = "Unknown Channel";
      }
    } else if (line.startsWith('#KODIPROP:inputstream.adaptive.license_type=')) {
        currentChannel.licenseType = line.split('=')[1].trim();
    } else if (line.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
        currentChannel.licenseKey = line.split('=')[1].trim();
    } else if (line && !line.startsWith('#')) {
      currentChannel.url = line;
      if (currentChannel.url && currentChannel.name) {
        channels.push(currentChannel as Channel);
      }
      currentChannel = { id: Math.random().toString(36).substring(7) };
    }
  }

  return channels;
}
