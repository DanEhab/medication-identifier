import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Routes in `api/` that the dev server is allowed to mount. */
const API_ROUTES = ['generate', 'translate'] as const;

/**
 * Runs the Vercel serverless functions from `api/` inside the Vite dev server,
 * so `npm run dev` exercises the real backend without deploying anything.
 * In production Vercel serves these same files directly.
 */
function vercelApiDevServer(env: Record<string, string>): Plugin {
  return {
    name: 'vercel-api-dev-server',
    apply: 'serve',
    configureServer(server) {
      // Serverless handlers read config from process.env, same as on Vercel.
      for (const key of [
        'GEMINI_API_KEY',
        'MONGODB_URI',
        'ALLOWED_ORIGINS',
        'RATE_LIMIT_GENERATE_PER_MINUTE',
        'RATE_LIMIT_TRANSLATE_PER_MINUTE',
        'RATE_LIMIT_PER_DAY',
        'RATE_LIMIT_SALT',
      ]) {
        if (env[key]) process.env[key] = env[key];
      }

      server.middlewares.use('/api', async (req, res, next) => {
        const route = (req.url ?? '').split('?')[0].replace(/^\/+|\/+$/g, '');
        if (!API_ROUTES.includes(route as (typeof API_ROUTES)[number])) return next();

        try {
          const body = await readJsonBody(req);
          const handler = require(path.join(rootDir, 'api', `${route}.js`));
          await handler(decorateRequest(req, body), decorateResponse(res));
        } catch (error) {
          console.error(`[api/${route}]`, error);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal error' }));
          }
        }
      });
    },
  };
}

/** Vercel parses JSON bodies for you; Connect does not. */
function readJsonBody(req: { on: Function; method?: string }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST' && req.method !== 'PUT') return resolve(undefined);
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
  });
}

function decorateRequest(req: any, body: unknown) {
  req.body = body;
  return req;
}

/** Minimal stand-in for the `res.status().json()` helpers Vercel injects. */
function decorateResponse(res: any) {
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: unknown) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const pkg = require('./package.json');

  return {
    define: {
      // Footer displays this, and CoachMarks uses it as TUTORIAL_VERSION to decide
      // whether to replay the tour after an update. Dropping it silently breaks both.
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [react(), vercelApiDevServer(env)],
    resolve: {
      alias: { '@': path.resolve(rootDir, 'src') },
      // Force a single React copy. Node resolves up the directory tree, so a
      // node_modules in a parent folder can otherwise supply a second React and
      // break hooks with "Invalid hook call".
      dedupe: ['react', 'react-dom'],
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
