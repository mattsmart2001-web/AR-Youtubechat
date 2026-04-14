/**
 * Run once to complete OAuth 2.0 and save tokens:
 *   npm run auth
 *
 * Prerequisites:
 *  - Copy .env.example to .env and fill in YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET
 *  - In Google Cloud Console add http://localhost:3001/callback as an authorised redirect URI
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { google } from 'googleapis';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { URL } from 'url';

const TOKENS_PATH = path.join(__dirname, '..', '.tokens.json');
const REDIRECT_URI = 'http://localhost:3001/callback';
const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];

async function authenticate(): Promise<void> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in .env');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('\nOpen this URL in your browser to authorise:\n');
  console.log(authUrl);
  console.log('\nWaiting for authorisation...\n');

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const parsed = new URL(req.url, 'http://localhost:3001');
      if (parsed.pathname !== '/callback') return;

      const code = parsed.searchParams.get('code');
      const error = parsed.searchParams.get('error');

      if (error) {
        res.end('<h2>Authorisation denied. You can close this window.</h2>');
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.end('<h2>No code received. Try again.</h2>');
        return;
      }

      res.end('<h2>Authorisation successful! You can close this window.</h2>');
      server.close();
      resolve(code);
    });

    server.listen(3001, () => {
      console.log('Listening on http://localhost:3001/callback ...');
    });

    server.on('error', reject);
  });

  const { tokens } = await oauth2Client.getToken(code);
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  console.log('\nTokens saved to .tokens.json');
  console.log('Run "npm run dev" to start the app.');
}

authenticate().catch((err) => {
  console.error('Auth failed:', err.message ?? err);
  process.exit(1);
});
