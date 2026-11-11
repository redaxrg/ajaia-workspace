import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USERS = [
  { id: 'alice', name: 'Alice Chen', email: 'alice@ajaia.test', initials: 'AC', color: '#b7d76c' },
  { id: 'marco', name: 'Marco Ruiz', email: 'marco@ajaia.test', initials: 'MR', color: '#efb37e' },
];
const UPLOAD_LIMIT = 2 * 1024 * 1024;

// Build the initial review document and its sample Alice-to-Marco share.
function starterDocument() {
  return {
    id: 'welcome-doc',
    title: 'A calmer way to work together',
    ownerId: 'alice',
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Good work starts with a clear page.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Ajaia Notes is a small shared space for the thinking behind the work. Make a document, invite a teammate, and keep moving.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A few things to try' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Format a thought with the toolbar above.' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open the account switcher to see this page as Marco.' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Share a document with a teammate as an editor or viewer.' }] }] },
        ] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Your drafts save as you write.' }] },
      ],
    },
    sharedWith: [{ userId: 'marco', role: 'editor' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Load persisted documents, creating a seeded store on the first run.
async function readState(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, 'ajaia-data.json');
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const initial = { documents: [starterDocument()] };
    await writeState(dataDir, initial);
    return initial;
  }
}

// Persist a complete snapshot using a temporary file before replacing the store.
async function writeState(dataDir, state) {
  await fs.mkdir(dataDir, { recursive: true });
  const destination = path.join(dataDir, 'ajaia-data.json');
  const temporary = `${destination}.${randomUUID()}.tmp`;
  // Replace the store only after the full snapshot has been written.
  await fs.writeFile(temporary, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(temporary, destination);
}

// Resolve an ID against the fixed demo accounts used by password login.
function userFor(id) {
  return USERS.find((user) => user.id === id);
}

// Return the caller's effective role, or null when the document is inaccessible.
function accessRole(document, userId) {
  if (document.ownerId === userId) return 'owner';
  return document.sharedWith.find((share) => share.userId === userId)?.role ?? null;
}

// Add display-ready owner and collaborator objects to the stored document shape.
function presentDocument(document) {
  return {
    ...document,
    owner: userFor(document.ownerId),
    sharedWith: document.sharedWith.map((share) => ({ ...share, user: userFor(share.userId) })),
  };
}

// Convert supported Markdown headings and simple lists into TipTap document nodes.
function markdownToDocument(rawText) {
  const lines = rawText.replace(/\r\n?/g, '\n').split('\n');
  const nodes = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      nodes.push({ type: 'heading', attrs: { level: heading[1].length }, content: [{ type: 'text', text: heading[2] }] });
      index += 1;
      continue;
    }
    const listMatch = line.match(/^\s*([-*+] |\d+\. )/);
    if (listMatch) {
      const ordered = /^\s*\d+\. /.test(line);
      const items = [];
      while (index < lines.length && /^\s*([-*+] |\d+\. )/.test(lines[index]) && /^\s*\d+\. /.test(lines[index]) === ordered) {
        const itemText = lines[index].replace(/^\s*([-*+] |\d+\. )/, '').trim();
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: itemText ? [{ type: 'text', text: itemText }] : [] }] });
        index += 1;
      }
      nodes.push({ type: ordered ? 'orderedList' : 'bulletList', content: items });
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+/.test(lines[index]) && !/^\s*([-*+] |\d+\. )/.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    nodes.push({ type: 'paragraph', content: [{ type: 'text', text: paragraph.join(' ') }] });
  }
  return { type: 'doc', content: nodes.length ? nodes : [{ type: 'paragraph' }] };
}

// Configure upload handling, demo identity, document routes, and static frontend serving.
export function createApp({ dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'), env = process.env } = {}) {
  const app = express();
  const production = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET || (!production && 'local-only-session-secret-change-before-deploy');
  const passwords = {
    alice: env.DEMO_ALICE_PASSWORD || (!production && 'alice-demo'),
    marco: env.DEMO_MARCO_PASSWORD || (!production && 'marco-demo'),
  };
  if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters.');
  if (!passwords.alice || !passwords.marco) throw new Error('Set DEMO_ALICE_PASSWORD and DEMO_MARCO_PASSWORD before starting in production.');
  if (production && (passwords.alice.length < 16 || passwords.marco.length < 16)) {
    throw new Error('Production demo passwords must be at least 16 characters long.');
  }
  if (production) {
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }));
  }
  const passwordSalts = { alice: randomBytes(16), marco: randomBytes(16) };
  const passwordHashes = Object.fromEntries(Object.entries(passwords).map(([id, password]) => [id, scryptSync(password, passwordSalts[id], 64)]));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_LIMIT, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (/\.(txt|md)$/i.test(file.originalname)) callback(null, true);
      else callback(Object.assign(new Error('Choose a .txt or .md file.'), { status: 400 }));
    },
  });
  app.use(express.json({ limit: '2mb' }));
  app.set('trust proxy', production ? 1 : false);
  app.use(cookieSession({
    name: 'ajaia.sid',
    keys: [sessionSecret],
    maxAge: 8 * 60 * 60 * 1000,
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    path: '/',
  }));
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  // Expose the demo account list so the client can populate its profile switcher.
  app.get('/api/users', (_request, response) => response.json({ users: USERS }));

  // Verify a password before issuing a signed, account-specific session cookie.
  app.post('/api/login', loginLimiter, async (request, response, next) => {
    try {
      const { userId, password } = request.body ?? {};
      const user = userFor(userId);
      const expectedHash = user && passwordHashes[user.id];
      const actualHash = typeof password === 'string' && password.length <= 256
        ? scryptSync(password, passwordSalts[user?.id] || passwordSalts.alice, 64)
        : Buffer.alloc(64);
      if (!user || !timingSafeEqual(actualHash, expectedHash || passwordHashes.alice)) {
        return response.status(401).json({ error: 'Account or password is incorrect.' });
      }
      request.session = { userId: user.id };
      response.json({ user });
    } catch (error) { next(error); }
  });

  app.get('/api/session', (request, response) => {
    response.json({ user: userFor(request.session?.userId) || null });
  });

  app.post('/api/logout', (request, response) => {
    request.session = null;
    response.status(204).end();
  });

  app.use('/api', (request, response, next) => {
    const user = userFor(request.session?.userId);
    if (!user) return response.status(401).json({ error: 'Choose a demo account to continue.' });
    request.user = user;
    next();
  });

  // Return only documents visible to this account, with its effective role attached.
  app.get('/api/documents', async (request, response, next) => {
    try {
      const state = await readState(dataDir);
      const documents = state.documents
        .filter((document) => accessRole(document, request.user.id))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((document) => ({ ...presentDocument(document), access: accessRole(document, request.user.id) }));
      response.json({ documents });
    } catch (error) { next(error); }
  });

  // Create an empty document owned by the selected demo account.
  app.post('/api/documents', async (request, response, next) => {
    try {
      const title = String(request.body?.title ?? '').trim();
      if (!title || title.length > 120) return response.status(400).json({ error: 'Give your document a title under 120 characters.' });
      const state = await readState(dataDir);
      const now = new Date().toISOString();
      const document = { id: randomUUID(), title, ownerId: request.user.id, content: { type: 'doc', content: [{ type: 'paragraph' }] }, sharedWith: [], createdAt: now, updatedAt: now };
      state.documents.push(document);
      await writeState(dataDir, state);
      response.status(201).json({ document: { ...presentDocument(document), access: 'owner' } });
    } catch (error) { next(error); }
  });

  // Import one bounded text or Markdown file as a new document.
  app.post('/api/documents/import', upload.single('file'), async (request, response, next) => {
    try {
      if (!request.file) return response.status(400).json({ error: 'Choose a .txt or .md file to import.' });
      const rawText = request.file.buffer.toString('utf8');
      if (!rawText.trim()) return response.status(400).json({ error: 'That file is empty.' });
      const title = path.basename(request.file.originalname, path.extname(request.file.originalname)).trim().slice(0, 120) || 'Imported document';
      const state = await readState(dataDir);
      const now = new Date().toISOString();
      const document = { id: randomUUID(), title, ownerId: request.user.id, content: markdownToDocument(rawText), sharedWith: [], createdAt: now, updatedAt: now };
      state.documents.push(document);
      await writeState(dataDir, state);
      response.status(201).json({ document: { ...presentDocument(document), access: 'owner' } });
    } catch (error) { next(error); }
  });

  // Load a document only when the caller owns it or has an explicit share.
  app.get('/api/documents/:id', async (request, response, next) => {
    try {
      const state = await readState(dataDir);
      const document = state.documents.find((item) => item.id === request.params.id);
      // Hide inaccessible documents as not found rather than revealing their existence.
      const role = document && accessRole(document, request.user.id);
      if (!document || !role) return response.status(404).json({ error: 'Document not found.' });
      response.json({ document: { ...presentDocument(document), access: role } });
    } catch (error) { next(error); }
  });

  // Save title and TipTap content; shared viewers are intentionally read-only.
  app.put('/api/documents/:id', async (request, response, next) => {
    try {
      const state = await readState(dataDir);
      const document = state.documents.find((item) => item.id === request.params.id);
      const role = document && accessRole(document, request.user.id);
      if (!document || !role) return response.status(404).json({ error: 'Document not found.' });
      if (role === 'viewer') return response.status(403).json({ error: 'You have view-only access.' });
      const title = String(request.body?.title ?? document.title).trim();
      if (!title || title.length > 120) return response.status(400).json({ error: 'Give your document a title under 120 characters.' });
      if (!request.body?.content || request.body.content.type !== 'doc' || !Array.isArray(request.body.content.content)) {
        return response.status(400).json({ error: 'Document content is invalid.' });
      }
      document.title = title;
      document.content = request.body.content;
      document.updatedAt = new Date().toISOString();
      await writeState(dataDir, state);
      response.json({ document: { ...presentDocument(document), access: role } });
    } catch (error) { next(error); }
  });

  // Create or update a collaborator's role; only the owner may change sharing.
  app.post('/api/documents/:id/shares', async (request, response, next) => {
    try {
      const state = await readState(dataDir);
      const document = state.documents.find((item) => item.id === request.params.id);
      if (!document || document.ownerId !== request.user.id) return response.status(404).json({ error: 'Document not found.' });
      const recipient = userFor(request.body?.userId) || USERS.find((user) => user.email.toLowerCase() === String(request.body?.email ?? '').trim().toLowerCase());
      const role = request.body?.role;
      if (!recipient || recipient.id === request.user.id) return response.status(400).json({ error: 'Choose another demo teammate.' });
      if (!['editor', 'viewer'].includes(role)) return response.status(400).json({ error: 'Choose editor or viewer access.' });
      const existing = document.sharedWith.find((share) => share.userId === recipient.id);
      if (existing) existing.role = role;
      else document.sharedWith.push({ userId: recipient.id, role });
      document.updatedAt = new Date().toISOString();
      await writeState(dataDir, state);
      response.json({ document: { ...presentDocument(document), access: 'owner' } });
    } catch (error) { next(error); }
  });

  // Revoke one collaborator's access, restricted to the document owner.
  app.delete('/api/documents/:id/shares/:userId', async (request, response, next) => {
    try {
      const state = await readState(dataDir);
      const document = state.documents.find((item) => item.id === request.params.id);
      if (!document || document.ownerId !== request.user.id) return response.status(404).json({ error: 'Document not found.' });
      document.sharedWith = document.sharedWith.filter((share) => share.userId !== request.params.userId);
      document.updatedAt = new Date().toISOString();
      await writeState(dataDir, state);
      response.json({ document: { ...presentDocument(document), access: 'owner' } });
    } catch (error) { next(error); }
  });

  // Normalize upload/validation errors and avoid exposing internal server details.
  app.use('/api', (error, _request, response, _next) => {
    const status = error.status || (error instanceof multer.MulterError ? 400 : 500);
    response.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : error.message });
  });

  // Serve the production bundle and route client-side paths back to the app shell.
  app.use(express.static(path.join(ROOT, 'dist')));
  app.get('*path', (_request, response, next) => {
    response.sendFile(path.join(ROOT, 'dist', 'index.html'), (error) => { if (error) next(); });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = Number(process.env.PORT || 3001);
  // Bind all interfaces so local containers and hosted platforms can reach the service.
  app.listen(port, '0.0.0.0', () => console.log(`Ajaia Notes listening on ${port}`));
}
