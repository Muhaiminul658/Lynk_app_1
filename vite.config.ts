import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';
import PushNotifications from '@pusher/push-notifications-server';
import agoraTokenPkg from 'agora-token';

const { RtcTokenBuilder, RtcRole } = agoraTokenPkg as any;

function agoraDevTokenPlugin(): Plugin {
  const appId = process.env.AGORA_APP_ID || "bbed08f1b0494680a4a50b7d842d2f4e";
  const appCertificate = process.env.AGORA_APP_CERTIFICATE || "4f276765b71144bd863b9488fc690911";

  return {
    name: 'agora-dev-token-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (url.startsWith('/api/agora-token') || url.startsWith('/api/agora/token')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          const parsedUrl = new URL(url, 'http://localhost:3000');
          const channelName = parsedUrl.searchParams.get('channel');
          const uidParam = parsedUrl.searchParams.get('uid') || '0';

          if (!channelName) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'channel query param is required' }));
            return;
          }

          try {
            const expirationTimeInSeconds = 3600 * 24;
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
            const role = RtcRole.PUBLISHER;

            let token = '';
            if (typeof uidParam === 'string' && isNaN(Number(uidParam))) {
              token = RtcTokenBuilder.buildTokenWithUserAccount(
                appId,
                appCertificate,
                channelName,
                uidParam,
                role,
                privilegeExpiredTs,
                privilegeExpiredTs
              );
            } else {
              token = RtcTokenBuilder.buildTokenWithUid(
                appId,
                appCertificate,
                channelName,
                Number(uidParam) || 0,
                role,
                privilegeExpiredTs,
                privilegeExpiredTs
              );
            }

            res.statusCode = 200;
            res.end(JSON.stringify({
              token,
              appId,
              channel: channelName,
              uid: uidParam
            }));
          } catch (err: any) {
            console.error('Agora Token generation error:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err?.message || 'Token generation failed' }));
          }
          return;
        }
        next();
      });
    }
  };
}

function pusherBeamsDevPlugin(): Plugin {
  const instanceId = process.env.PUSHER_BEAMS_INSTANCE_ID || "71cf24d7-5e54-48d2-a980-2bd7495d6ef2";
  const secretKey = process.env.PUSHER_BEAMS_SECRET_KEY || "1F8FCAB9D92DB920B3137EBFF0F86940F98478C8F96C808D2491D529866947EA";

  let beamsServerClient: PushNotifications | null = null;
  const getClient = () => {
    if (!beamsServerClient) {
      beamsServerClient = new PushNotifications({ instanceId, secretKey });
    }
    return beamsServerClient;
  };

  return {
    name: 'pusher-beams-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (url.startsWith('/api/send-push') || url.startsWith('/api/push-notification')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }

          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = body ? JSON.parse(body) : {};
              const { targetUid, interest, title, body: msgBody, icon, deepLink, deep_link } = data;
              const targetInterest = interest || (targetUid ? `user_${targetUid}` : 'hello');
              const client = getClient();
              const publishResponse = await client.publishToInterests([targetInterest], {
                web: {
                  notification: {
                    title: title || 'New message on Lynk',
                    body: msgBody || 'You received a new message',
                    icon: icon || '/icon-192.jpg',
                    deep_link: deepLink || deep_link || 'https://lynk-app.vercel.app',
                  },
                  data: {
                    targetUid: targetUid || '',
                    timestamp: Date.now()
                  }
                },
              });
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, interest: targetInterest, publishResponse }));
            } catch (err: any) {
              console.error('Pusher Beams Dev API Error:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err?.message || 'Push error' }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), agoraDevTokenPlugin(), pusherBeamsDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
