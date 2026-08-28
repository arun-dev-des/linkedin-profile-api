import express from 'express';
import { fileURLToPath } from 'node:url';

import { config, hasCredentials, missingCredentials } from './config.js';
import { rateLimiter } from './cache.js';
import { ApiError } from './errors.js';
import { parseProfileUrl } from './linkedin/url.js';
import { getProfile, getSampleProfile } from './service.js';

const app = express();

// Hosting platforms terminate TLS upstream; without this every client shares
// the proxy's IP and the rate limiter becomes global.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    // Log the path and query only — never headers, which carry the cookies.
    console.log(
      JSON.stringify({
        method: req.method,
        path: req.path,
        query: req.query,
        status: res.statusCode,
        ms: Date.now() - startedAt,
      }),
    );
  });
  next();
});

app.use(rateLimiter(config.rateLimit));

// The browser UI. Static files are served before the API routes; only paths
// that match a file in public/ are handled here, everything else falls through.
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

app.get('/api', (req, res) => {
  res.json({
    service: 'linkedin-profile-api',
    description: 'Returns a LinkedIn profile as structured JSON.',
    endpoints: {
      'GET /': 'Browser UI.',
      'GET /health': 'Liveness check.',
      'GET /profile?url=<linkedin profile url>': 'Fetch and normalize a profile.',
      'GET /profile/sample': 'A cached real response. Never calls LinkedIn.',
    },
    documentation: 'https://github.com/arun-dev-des/linkedin-profile-api',
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    credentialsConfigured: hasCredentials(),
  });
});

// Registered before /profile so the literal path wins over the query route.
app.get('/profile/sample', (req, res) => {
  res.json(getSampleProfile());
});

app.get('/profile', async (req, res) => {
  const publicId = parseProfileUrl(req.query.url);
  res.json(await getProfile(publicId));
});

app.use((req, res) => {
  res.status(404).json({
    error: { code: 'not_found', message: `No route for ${req.method} ${req.path}.` },
  });
});

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json(err.toJSON());
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong handling this request.' },
  });
});

app.listen(config.port, () => {
  console.log(`linkedin-profile-api listening on port ${config.port}`);

  const missing = missingCredentials();
  if (missing.length > 0) {
    console.warn(
      `WARNING: missing ${missing.join(' and ')} — /profile will return 503. ` +
        '/profile/sample still works. See .env.example.',
    );
  }
});

export default app;
