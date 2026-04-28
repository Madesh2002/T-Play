import { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DOMParser } from '@xmldom/xmldom';

const dataDir = path.join(process.cwd(), 'data');
const loginFilePath = path.join(dataDir, 'login.json');
const guestCredsFilePath = path.join(dataDir, 'guest-device.cred');
const cachePath = path.join(dataDir, 'cache_urls.json');
const cacheKidPath = path.join(dataDir, 'cache_kid.json');
const stbOnlyPath = 'https://tp.drmlive-01.workers.dev/stb_only';
const originApi = 'https://tp.drmlive-01.workers.dev/origin';

const aesKey = 'aesEncryptionKey';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function generateNumericUuid(): string {
  return `${Math.floor(Math.random() * 900) + 100}${Date.now()}${Math.floor(Math.random() * 90) + 10}`;
}

async function getGuestCreds() {
  if (fs.existsSync(guestCredsFilePath)) {
    return JSON.parse(fs.readFileSync(guestCredsFilePath, 'utf8'));
  }
  
  const deviceId = generateNumericUuid();
  const res = await fetch('https://tb.tapi.videoready.tv/binge-mobile-services/pub/api/v1/user/guest/register', {
    method: 'POST',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'authorization': 'bearer undefined',
      'content-length': '0',
      'referer': 'https://www.tataplaybinge.com/',
      'deviceid': deviceId,
      'origin': 'https://www.tataplaybinge.com',
      'user-agent': ua
    }
  });

  const guestData = await res.json();
  const anonymousId = guestData?.data?.anonymousId;

  if (anonymousId) {
    const creds = { deviceId, anonymousId };
    fs.writeFileSync(guestCredsFilePath, JSON.stringify(creds, null, 2));
    return creds;
  }
  throw new Error("Failed to register device.");
}

async function finalizeKidAndPssh(data: { wv_pssh: string | null, pr_pssh: string | null }) {
  const CACHE_TTL = 600 * 1000;
  const now = Date.now();
  
  let cache: Record<string, {kid: string, timestamp: number}> = {};
  if (fs.existsSync(cacheKidPath)) {
    cache = JSON.parse(fs.readFileSync(cacheKidPath, 'utf8'));
  }
  
  // Cleanup
  for (const k in cache) {
    if (now - cache[k].timestamp > CACHE_TTL) delete cache[k];
  }

  const result = { pssh: null as string | null, pr_pssh: null as string | null, kid: null as string | null };

  if (data.wv_pssh) {
    const psshB64 = data.wv_pssh;
    const psshHex = Buffer.from(psshB64, 'base64').toString('hex');

    if (!cache[psshHex]) {
      const resp = await fetch(`https://tp.secure-kid.workers.dev/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pssh: psshHex })
      });
      const respData = await resp.json();
      cache[psshHex] = { kid: respData.encryptedKID, timestamp: now };
    }
    
    const kidHex = cache[psshHex].kid;
    result.pssh = psshB64;
    if (kidHex && kidHex.length >= 32) {
      result.kid = `${kidHex.substring(0,8)}-${kidHex.substring(8,12)}-${kidHex.substring(12,16)}-${kidHex.substring(16,20)}-${kidHex.substring(20)}`;
    }
  }

  if (data.pr_pssh) {
    result.pr_pssh = data.pr_pssh;
  }

  fs.writeFileSync(cacheKidPath, JSON.stringify(cache, null, 2));
  return result;
}

function extractPsshFromMpdContent(content: string) {
  try {
    const WV_SYSTEM_ID = 'edef8ba9';
    const PR_SYSTEM_ID = '9a04f079';
    
    // Quick regex to find matching PSSHs
    const wvRegex = new RegExp(`<cenc:pssh[^>]*>([a-zA-Z0-9+/=]+)</cenc:pssh>`, 'g');
    let wv_pssh = null;
    let pr_pssh = null;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    
    const contentProtections = doc.getElementsByTagName('ContentProtection');
    for (let i = 0; i < contentProtections.length; i++) {
        const cp = contentProtections[i];
        const schemeIdUri = cp.getAttribute('schemeIdUri')?.toLowerCase() || '';
        
        if (schemeIdUri.includes(WV_SYSTEM_ID)) {
          const psshNodes = cp.getElementsByTagNameNS('*', 'pssh');
          if (psshNodes.length > 0 && psshNodes[0].textContent) {
              wv_pssh = psshNodes[0].textContent.trim();
          } else {
             // Fallback to finding by localName
             const unNamespaced = cp.getElementsByTagName('cenc:pssh');
             if(unNamespaced.length > 0 && unNamespaced[0].textContent) wv_pssh = unNamespaced[0].textContent.trim();
          }
        } else if (schemeIdUri.includes(PR_SYSTEM_ID)) {
          const psshNodes = cp.getElementsByTagNameNS('*', 'pssh');
          if (psshNodes.length > 0 && psshNodes[0].textContent) {
              pr_pssh = psshNodes[0].textContent.trim();
          } else {
             const unNamespaced = cp.getElementsByTagName('cenc:pssh');
             if(unNamespaced.length > 0 && unNamespaced[0].textContent) pr_pssh = unNamespaced[0].textContent.trim();
          }
        }
    }
    
    if (!wv_pssh && !pr_pssh) return null;
    return { wv_pssh, pr_pssh };

  } catch(e) {
    console.error(e);
    return null;
  }
}

function decryptUrlStr(encryptedUrl: string, aesKey: string) {
    try {
      const cleanEncrypted = encryptedUrl.replace(/#.*$/, '');
      const decoded = Buffer.from(cleanEncrypted, 'base64');
      const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(aesKey, 'utf8'), null);
      decipher.setAutoPadding(true);
      let decrypted = decipher.update(decoded, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch(e) {
      return null;
    }
}

export function registerTataPlayRoutes(app: Express) {

  app.get('/api/check_login', (req: Request, res: Response) => {
    res.json({ exists: fs.existsSync(loginFilePath) });
  });

  app.post('/api/send_otp', async (req: Request, res: Response) => {
    const { mobile } = req.body;
    if (!/^[6-9]\d{9}$/.test(mobile)) return res.status(400).send("Invalid mobile number.");

    try {
      const cred = await getGuestCreds();
      const headers = {
        "accept": "application/json, text/plain, */*",
        "anonymousid": cred.anonymousId,
        "content-length": "0",
        "deviceid": cred.deviceId,
        "mobilenumber": mobile,
        "newotpflow": "4DOTP",
        "origin": "https://www.tataplaybinge.com",
        "platform": "BINGE_ANYWHERE",
        "referer": "https://www.tataplaybinge.com/",
        "user-agent": ua
      };

      const out = await fetch('https://tb.tapi.videoready.tv/binge-mobile-services/pub/api/v1/user/authentication/generateOTP', {
        method: 'POST',
        headers
      });
      const data = await out.json();
      res.send(data.message || "OTP send status unknown");
    } catch(e: any) {
      res.status(500).send(e.message);
    }
  });

  app.post('/api/verify_otp', async (req: Request, res: Response) => {
    const { mobile, otp } = req.body;
    if (!/^[6-9]\d{9}$/.test(mobile) || !/^\d{4,6}$/.test(otp)) return res.status(400).send("Invalid input.");

    try {
      if (!fs.existsSync(guestCredsFilePath)) return res.status(500).send("Missing device credentials.");
      const cred = JSON.parse(fs.readFileSync(guestCredsFilePath, 'utf8'));

      const validateHeaders = {
        "accept": "application/json, text/plain, */*",
        "anonymousid": cred.anonymousId,
        "content-type": "application/json",
        "deviceid": cred.deviceId,
        "origin": "https://www.tataplaybinge.com",
        "platform": "BINGE_ANYWHERE",
        "referer": "https://www.tataplaybinge.com/",
        "user-agent": ua
      };

      const out = await fetch('https://tb.tapi.videoready.tv/binge-mobile-services/pub/api/v1/user/authentication/validateOTP', {
        method: 'POST',
        headers: validateHeaders,
        body: JSON.stringify({ mobileNumber: mobile, otp })
      });
      const validateData = await out.json();

      if (!validateData.data?.userAuthenticateToken) {
        return res.send(validateData.message || "OTP validation failed");
      }

      const token = validateData.data.userAuthenticateToken;
      const devicetoken = validateData.data.deviceAuthenticateToken;

      // GET subscriber details
      const subOut = await fetch('https://tb.tapi.videoready.tv/binge-mobile-services/api/v4/subscriber/details', {
         headers: {
            "accept": "application/json, text/plain, */*",
            "anonymousid": cred.anonymousId,
            "authorization": `bearer ${token}`,
            "devicetype": "WEB",
            "mobilenumber": mobile,
            "origin": "https://www.tataplaybinge.com",
            "platform": "BINGE_ANYWHERE",
            "referer": "https://www.tataplaybinge.com/",
            "user-agent": ua
         }
      });
      const subData = await subOut.json();
      const accountDetails = subData?.data?.accountDetails?.[0] || {};
      const dthStatus = accountDetails.dthStatus || '';

      let loginUrl = '';
      let loginBody: any = {};

      if (!dthStatus) {
          loginUrl = 'https://tb.tapi.videoready.tv/binge-mobile-services/api/v3/create/new/user';
          loginBody = {
              "dthStatus": "Non DTH User",
              "subscriberId": mobile,
              "login": "OTP",
              "mobileNumber": mobile,
              "isPastBingeUser": false,
              "eulaChecked": true,
              "packageId": ""
          };
      } else if (dthStatus === "DTH Without Binge") {
          loginUrl = 'https://tb.tapi.videoready.tv/binge-mobile-services/api/v3/create/new/user';
          loginBody = {
              "dthStatus": "DTH Without Binge",
              "subscriberId": accountDetails.subscriberId || '',
              "login": "OTP",
              "mobileNumber": mobile,
              "baId": null,
              "isPastBingeUser": false,
              "eulaChecked": true,
              "packageId": "",
              "referenceId": null
          };
      } else {
          loginUrl = 'https://tb.tapi.videoready.tv/binge-mobile-services/api/v3/update/exist/user';
          loginBody = {
              "dthStatus": dthStatus,
              "subscriberId": accountDetails.subscriberId || '',
              "bingeSubscriberId": accountDetails.bingeSubscriberId || '',
              "baId": accountDetails.baId || '',
              "login": "OTP",
              "mobileNumber": mobile,
              "payment_return_url": "https://www.tataplaybinge.com/subscription-transaction/status",
              "eulaChecked": true,
              "packageId": ""
          };
      }

      const loginOut = await fetch(loginUrl, {
        method: 'POST',
        headers: {
            "accept": "application/json, text/plain, */*",
            "anonymousid": cred.anonymousId,
            "authorization": `bearer ${token}`,
            "content-type": "application/json",
            "device": "WEB",
            "deviceid": cred.deviceId,
            "devicename": "Web",
            "devicetoken": devicetoken,
            "origin": "https://www.tataplaybinge.com",
            "platform": "WEB",
            "referer": "https://www.tataplaybinge.com/",
            "user-agent": ua
        },
        body: JSON.stringify(loginBody)
      });
      const loginData = await loginOut.json();
      
      fs.writeFileSync(loginFilePath, JSON.stringify(loginData, null, 2));
      res.send(loginData.message || "Login successful");

    } catch(e: any) {
      res.status(500).send(e.message);
    }
  });

  app.post('/api/logout', async (req: Request, res: Response) => {
    if (!fs.existsSync(loginFilePath)) return res.send("Already logged out.");
    try {
      const loginData = JSON.parse(fs.readFileSync(loginFilePath, 'utf8'));
      const guestCreds = fs.existsSync(guestCredsFilePath) ? JSON.parse(fs.readFileSync(guestCredsFilePath, 'utf8')) : {};
      
      const loginInfo = loginData.data || {};
      const baId = loginInfo.baId;
      if (baId && guestCreds.deviceId) {
        await fetch(`https://tb.tapi.videoready.tv/binge-mobile-services/api/v2/logout/${baId}`, {
          method: 'POST',
          headers: {
            'authorization': loginInfo.userAuthenticateToken,
            'deviceid': guestCreds.deviceId,
            'devicetoken': loginInfo.deviceAuthenticateToken,
            'dthstatus': loginInfo.dthStatus,
            'subscriberid': loginInfo.subscriberId,
            'subscriptiontype': loginInfo.subscriptionStatus,
            'user-agent': ua
          }
        });
      }
    } catch(e) {}
    
    if (fs.existsSync(loginFilePath)) fs.unlinkSync(loginFilePath);
    if (fs.existsSync(guestCredsFilePath)) fs.unlinkSync(guestCredsFilePath);
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
    
    res.send("You have been successfully logged out.");
  });

  app.get('/api/playlist.m3u', async (req: Request, res: Response) => {
    if (!fs.existsSync(loginFilePath)) return res.status(401).send("Login required.");
    try {
      const out = await fetch(originApi);
      const data = await out.json();
      const channels = data?.data?.list || [];

      const skipOut = await fetch(stbOnlyPath);
      const skipIds = await skipOut.json() as string[];

      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers.host;
      const baseUrl = `${proto}://${host}`;

      let m3u = "";
      for (const channel of channels) {
         const channel_id = channel.id;
         if (skipIds.includes(channel_id)) continue;
         if (channel.provider === 'DistroTV') continue;

         const channel_name = channel.title;
         const channel_logo = channel.transparentImageUrl;
         const genres = (channel.genres || []).filter((g: string) => g !== 'HD');
         const channel_genre = genres[0] || 'General';

         const license_url = `https://tp.drmlive-01.workers.dev?id=${channel_id}`;
         const dash_url = channel.streamData?.dashWidewinePlayUrl || '';
         
         let channel_live = '';
         let use_proxy = false;

         if (dash_url) {
             const dashHost = new URL(dash_url).hostname;
             if (dashHost.startsWith('bpaita')) {
                 channel_live = `${baseUrl}/api/get-mpd?id=${channel_id}`;
                 use_proxy = true;
             } else {
                 channel_live = dash_url;
             }
         }

         m3u += `#EXTINF:-1 tvg-id="ts${channel_id}" tvg-logo="${channel_logo}" group-title="${channel_genre}",${channel_name}\n`;
         m3u += `#KODIPROP:inputstream.adaptive.license_type=clearkey\n`;
         m3u += `#KODIPROP:inputstream.adaptive.license_key=${license_url}\n`;
         if (use_proxy) m3u += `#KODIPROP:inputstream.adaptive.manifest_type=mpd\n`;
         m3u += `#EXTVLCOPT:http-user-agent=${ua}\n`;
         m3u += `${channel_live}\n\n`;
      }

      res.setHeader('Content-Type', 'audio/x-mpegurl');
      res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u"');
      res.send(m3u);

    } catch(e: any) {
      res.status(500).send(`# Error: ${e.message}\n`);
    }
  });

  app.get('/api/get-mpd', async (req: Request, res: Response) => {
    const id = req.query.id as string;
    if (!id) return res.status(400).send('Missing content ID.');
    if (!fs.existsSync(loginFilePath)) return res.status(401).send('Login required.');

    try {
      const loginData = JSON.parse(fs.readFileSync(loginFilePath, 'utf8'));
      const subscriberId = loginData.data?.subscriberId;
      const userToken = loginData.data?.userAuthenticateToken;

      if (!subscriberId || !userToken) return res.status(403).send('Invalid login data.');

      let cacheData: any = {};
      if (fs.existsSync(cachePath)) cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      
      let mpdurl = null;
      let useCache = false;

      if (cacheData[id]) {
        const cachedUrl = cacheData[id].url;
        const qp = new URLSearchParams(cachedUrl.split('?')[1] || '');
        let hdntlStr = qp.get('hdntl');
        let exp = qp.get('exp');

        if (hdntlStr) {
           const hdntlParams = new URLSearchParams(hdntlStr.replace(/~/g, '&'));
           exp = hdntlParams.get('exp');
        }

        if (exp && parseInt(exp) > Date.now()/1000) {
           mpdurl = cachedUrl;
           useCache = true;
        }
      }

      if (!useCache) {
          const c_api = `https://tb.tapi.videoready.tv/content-detail/api/partner/cdn/player/details/chotiluli/${id}`;
          const out = await fetch(c_api, {
              headers: {
                  'Authorization': `Bearer ${userToken}`,
                  'subscriberId': subscriberId
              }
          });
          const cData = await out.json();
          if (!cData?.data?.dashPlayreadyPlayUrl) return res.status(404).send('dashPlayreadyPlayUrl not found.');

          const encryptedDashUrl = cData.data.dashPlayreadyPlayUrl;
          let decryptedUrl = decryptUrlStr(encryptedDashUrl, aesKey);

          if (!decryptedUrl) return res.status(500).send('Decryption failed');

          decryptedUrl = decryptedUrl.replace(/bpaita/g, 'bpaicatchupta').replace(/manifest/g, 'Manifest');

          if (!decryptedUrl.includes('bpaicatchupta')) {
             return res.redirect(decryptedUrl);
          }

          // Fetch to get hdntl cookie
          const initReq = await fetch(decryptedUrl, {
            method: 'GET',
            redirect: 'manual',
            headers: { 'User-Agent': ua }
          });

          // Check for hdntl set-cookie or redirect location
          let hdntl = null;
          const cookies = initReq.headers.get('set-cookie');
          if (cookies) {
             const match = cookies.match(/hdntl=([^;]+)/);
             if (match) hdntl = match[1].trim();
          }

          if (hdntl) {
              const cleanUrl = decryptedUrl.split('?')[0];
              mpdurl = hdntl.startsWith('hdntl=') ? `${cleanUrl}?${hdntl}` : `${cleanUrl}?hdntl=${hdntl}`;
          } else {
             const location = initReq.headers.get('location');
             if (location) {
               mpdurl = location.split('&')[0];
             } else {
               return res.redirect(decryptedUrl); // Fallback
             }
          }

          cacheData[id] = { url: mpdurl, updated_at: Date.now() };
          fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
      }

      if (!mpdurl) return res.status(500).send("Unable to resolve MPD URL");

      // Fetch MPD content
      const mpdReq = await fetch(mpdurl, {
         headers: {
            'User-Agent': ua,
            'Referer': 'https://watch.tataplay.com/',
            'Origin': 'https://watch.tataplay.com/'
         }
      });
      
      let mpdContent = await mpdReq.text();
      const baseUrlStr = mpdurl.substring(0, mpdurl.lastIndexOf('/'));
      
      const psshExtracted = extractPsshFromMpdContent(mpdContent);
      let getPssh = null;
      if (psshExtracted) {
         getPssh = await finalizeKidAndPssh(psshExtracted);
      }

      let processedManifest = mpdContent.replace(/dash\//g, `${baseUrlStr}/dash/`);
      
      if (getPssh) {
         processedManifest = processedManifest.replace(
           /mp4protection:2011/g,
           `mp4protection:2011" cenc:default_KID="${getPssh.kid || ''}`
         );
         processedManifest = processedManifest.replace(
            /" value="PlayReady"\/>/g,
            `"><cenc:pssh>${getPssh.pr_pssh || ''}</cenc:pssh></ContentProtection>`
         );
         processedManifest = processedManifest.replace(
            /" value="Widevine"\/>/g,
            `"><cenc:pssh>${getPssh.pssh || ''}</cenc:pssh></ContentProtection>`
         );
      }

      res.setHeader('Content-Security-Policy', "default-src 'self';");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Content-Type', 'application/dash+xml');
      res.setHeader('Content-Disposition', `attachment; filename="tp${id}.mpd"`);
      res.send(processedManifest);

    } catch(e: any) {
      console.error(e);
      res.status(500).send(e.message);
    }
  });

}
