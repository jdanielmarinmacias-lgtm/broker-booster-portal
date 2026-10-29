'use strict';
/* Sin dependencias: lee .env manual (KEY=VALUE) si existe, si no usa defaults. */
try {
  const fs = require('fs');
  const path = require('path');
  const envFile = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  }
} catch (e) { /* sin .env: defaults */ }

const path = require('path');

module.exports = {
  supabaseUrl: process.env.SUPABASE_URL || null,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || null,
  port: Number(process.env.PORT || 3000),
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, '..', 'data'),
  sessionTtlMs: Number(process.env.SESSION_TTL_HOURS || 12) * 3600 * 1000,
  seedPassword: process.env.SEED_PASSWORD || 'Cambiar123*',
  cookieSecure: String(process.env.COOKIE_SECURE || 'false') === 'true',
  /* IA del portal (Groq). Viene de GROQ_API_KEY (env en Vercel o .env local).
   * NUNCA se escribe la clave en el código (GitHub Push Protection) ni en
   * estáticos: solo la usa el proxy /api/ia/chat en el servidor. */
  groqApiKey: process.env.GROQ_API_KEY || null,
  cookieName: 'bb_session',
  // Sirve ../portal-modular como frontend
  frontendDir: path.join(__dirname, '..', '..', 'portal-modular'),
};
