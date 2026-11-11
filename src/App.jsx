import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold, Check, ChevronDown, ChevronLeft, CircleHelp, Clock3, FilePlus2,
  FileText, FolderOpen, Italic, List, ListOrdered, LoaderCircle, LockKeyhole,
  Share2, Type, Underline as UnderlineIcon, Upload, X,
} from 'lucide-react';

const emptyContent = { type: 'doc', content: [{ type: 'paragraph' }] };
const iconSize = 17;

// Format the saved timestamp for the document's compact metadata row.
function updatedLabel(timestamp) {
  const date = new Date(timestamp);
  if (Date.now() - date.getTime() < 60_000) return 'Edited just now';
  return `Edited ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

// Send API requests as the selected demo account and surface server messages.
async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData)) headers['content-type'] = 'application/json';
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not complete that action.');
  return payload;
}

// Render a consistent initials-based avatar for a demo workspace user.
function Avatar({ user, size = 'normal' }) {
  if (!user) return null;
  return <span className={`avatar avatar-${size}`} style={{ '--avatar-color': user.color }} aria-hidden="true">{user.initials}</span>;
}

// Render formatting controls whose active states reflect the current editor selection.
function EditorToolbar({ editor, readOnly }) {
  if (!editor) return null;
  const controls = [
    { label: 'Bold', icon: <Bold size={iconSize} />, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Italic', icon: <Italic size={iconSize} />, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Underline', icon: <UnderlineIcon size={iconSize} />, active: editor.isActive('underline'), run: () => editor.chain().focus().toggleUnderline().run() },
  ];
  return (
    <div className="format-toolbar" role="toolbar" aria-label="Text formatting">
      {/* Keep toolbar clicks from moving the editor selection before formatting runs. */}
      <button className={`format-select ${editor.isActive('heading') ? 'active' : ''}`} type="button" title="Text style" aria-label="Text style" disabled={readOnly} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Type size={iconSize} /><span>Text style</span><ChevronDown size={14} />
      </button>
      <span className="toolbar-divider" />
      {controls.map((control) => <button key={control.label} className={`icon-button ${control.active ? 'active' : ''}`} type="button" title={control.label} aria-label={control.label} aria-pressed={control.active} disabled={readOnly} onMouseDown={(event) => event.preventDefault()} onClick={control.run}>{control.icon}</button>)}
      <span className="toolbar-divider" />
      <button className={`icon-button ${editor.isActive('bulletList') ? 'active' : ''}`} type="button" title="Bulleted list" aria-label="Bulleted list" aria-pressed={editor.isActive('bulletList')} disabled={readOnly} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={iconSize} /></button>
      <button className={`icon-button ${editor.isActive('orderedList') ? 'active' : ''}`} type="button" title="Numbered list" aria-label="Numbered list" aria-pressed={editor.isActive('orderedList')} disabled={readOnly} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={iconSize} /></button>
    </div>
  );
}

// Connect TipTap's structured content to the document state while honoring viewer access.
function RichEditor({ content, editable, onChange }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: content || emptyContent,
    editable,
    editorProps: { attributes: { class: 'document-body', 'aria-label': 'Document content' } },
    // Send user edits upward, but never treat editor initialization as a viewer edit.
    onUpdate: ({ editor: currentEditor }) => {
      if (editable) onChange(currentEditor.getJSON());
    },
  }, [editable]);

  useEffect(() => {
    if (editor && content && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, content]);
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  return <><EditorToolbar editor={editor} readOnly={!editable} /><EditorContent editor={editor} /></>;
}

// Manage the share list and invite/revoke controls for the currently open document.
function ShareDialog({ document, users, activeUser, onClose, onShare, onRevoke, busy }) {
  const [recipient, setRecipient] = useState(users.find((user) => user.id !== activeUser.id)?.id || '');
  const [role, setRole] = useState('editor');
  const [dialogError, setDialogError] = useState('');
  const shares = document.sharedWith || [];

  // Let Escape dismiss the dialog and remove the listener when it closes.
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  // Validate the dialog submission through the parent share action and show failures locally.
  async function submit(event) {
    event.preventDefault();
    setDialogError('');
    try { await onShare(recipient, role); } catch (error) { setDialogError(error.message); }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="dialog-heading"><div><span className="eyebrow">DOCUMENT ACCESS</span><h2 id="share-title">Share document</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div>
        <p className="share-document-name">{document.title}</p>
        <div className="owner-row"><Avatar user={activeUser} /><span><strong>{activeUser.name}</strong><small>Owner</small></span><LockKeyhole size={16} className="muted-icon" /></div>
        {shares.map((share) => <div className="owner-row" key={share.userId}><Avatar user={share.user} /><span><strong>{share.user?.name}</strong><small>{share.user?.email}</small></span><div className="share-row-actions"><span className="role-label">{share.role}</span><button className="icon-button small" type="button" title={`Remove ${share.user?.name}`} aria-label={`Remove ${share.user?.name}`} onClick={() => onRevoke(share.userId)}><X size={15} /></button></div></div>)}
        <form className="share-form" onSubmit={submit}>
          <label htmlFor="share-person">Invite a teammate</label>
          <div className="share-fields"><select id="share-person" value={recipient} onChange={(event) => setRecipient(event.target.value)}>{users.filter((user) => user.id !== activeUser.id).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><select aria-label="Permission" value={role} onChange={(event) => setRole(event.target.value)}><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button className="primary-button invite-button" type="submit" disabled={busy || !recipient}>{busy ? 'Saving' : 'Invite'}</button></div>
          <p className="field-hint">Anyone in this demo workspace can be invited.</p>
          {dialogError && <p className="inline-error" role="alert">{dialogError}</p>}
        </form>
        <div className="dialog-foot"><Check size={15} /> Changes are saved automatically</div>
      </section>
    </div>
  );
}

// Sign in to an individual seeded account; identity is established by the server session.
function LoginScreen({ users, selectedUserId, onSelectUser, onLogin, busy, error }) {
  const [password, setPassword] = useState('');

  async function submit(event) {
    event.preventDefault();
    try {
      await onLogin(selectedUserId, password);
      setPassword('');
    } catch { setPassword(''); }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand login-brand"><div className="brand-mark"><span /></div><span>ajaia<span className="brand-light"> / notes</span></span></div>
        <span className="eyebrow">PRIVATE WORKSPACE</span>
        <h1>Sign in to your notes.</h1>
        <p>Use your demo account credentials to continue.</p>
        <label htmlFor="login-user">Account</label>
        <select id="login-user" value={selectedUserId} onChange={(event) => onSelectUser(event.target.value)} required>
          {users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
        </select>
        <label htmlFor="login-password">Password</label>
        <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="primary-button login-submit" type="submit" disabled={busy || !selectedUserId}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="login-footnote">This workspace uses account-specific access and secure session cookies.</p>
      </form>
    </main>
  );
}

// Own workspace state and coordinate document loading, editing, sharing, and persistence.
function App() {
  const [users, setUsers] = useState([]);
  const [activeUser, setActiveUser] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [document, setDocument] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('saved');
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [authUserId, setAuthUserId] = useState('alice');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const fileInput = useRef(null);
  const currentRef = useRef({ document: null, dirty: false, activeUser: null });
  currentRef.current = { document, dirty, activeUser };

  // Refresh the sidebar from the access-filtered document list for this account.
  const refreshDocuments = useCallback(async (userId) => {
    const result = await api('/api/documents');
    setDocuments(result.documents);
    return result.documents;
  }, []);

  // Save pending edits before switching documents or changing who can access them.
  async function flushCurrent() {
    const current = currentRef.current;
    if (!current.dirty || !current.document || !current.activeUser) return true;
    const payload = { title: current.document.title, content: current.document.content };
    setSaveState('saving');
    try {
      await api(`/api/documents/${current.document.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      const latest = currentRef.current;
      const unchanged = latest.document?.id === current.document.id && latest.document.title === payload.title && JSON.stringify(latest.document.content) === JSON.stringify(payload.content);
      if (!unchanged) {
        setError('The document changed while saving. Wait for the save to finish, then try again.');
        return false;
      }
      setDirty(false);
      setSaveState('saved');
      setDocuments((items) => items.map((item) => item.id === current.document.id ? { ...item, title: payload.title, updatedAt: new Date().toISOString() } : item));
      return true;
    } catch (saveError) {
      setSaveState('error');
      setError(`Your latest changes were not saved: ${saveError.message}`);
      return false;
    }
  }

  // Flush pending work, then load one document under the requested account's permissions.
  const openDocument = useCallback(async (id, userId = activeUser?.id) => {
    if (!userId) return;
    setError('');
    const latest = currentRef.current;
    if (latest.dirty && latest.document && latest.activeUser?.id === userId) {
      if (!(await flushCurrent())) return;
    }
    setSelectedId(id);
    setDocument(null);
    try {
      const result = await api(`/api/documents/${id}`);
      setDocument(result.document);
      setSaveState('saved');
      setDirty(false);
    } catch (loadError) { setError(loadError.message); }
  }, [activeUser]);

  // Restore the authenticated account from the server-side session cookie.
  useEffect(() => {
    let mounted = true;
    async function initialize() {
      try {
        const [usersResult, sessionResult] = await Promise.all([
          fetch('/api/users').then((response) => response.json()),
          fetch('/api/session', { credentials: 'same-origin' }).then((response) => response.json()),
        ]);
        if (!mounted) return;
        setUsers(usersResult.users);
        setAuthUserId(sessionResult.user?.id || usersResult.users[0]?.id || '');
        setActiveUser(sessionResult.user);
      } catch { if (mounted) setError('Could not connect to the workspace. Try refreshing.'); }
      finally { if (mounted) setLoading(false); }
    }
    initialize();
    return () => { mounted = false; };
  }, []);

  // Load a profile's accessible documents and ignore responses after the profile changes.
  useEffect(() => {
    if (!activeUser) {
      setDocuments([]);
      setDocument(null);
      setSelectedId('');
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setDocument(null);
    setSelectedId('');
    refreshDocuments(activeUser.id).then((items) => {
      if (mounted && items.length) openDocument(items[0].id);
    }).catch((loadError) => { if (mounted) setError(loadError.message); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [activeUser, refreshDocuments, openDocument]);

  // Debounce keystrokes so editing produces one save after a short pause.
  useEffect(() => {
    if (!dirty || !document || !activeUser) return undefined;
    setSaveState('saving');
    const savedId = document.id;
    const payload = { title: document.title, content: document.content };
    const timer = window.setTimeout(async () => {
      try {
        await api(`/api/documents/${savedId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setSaveState('saved');
        setDocuments((items) => items.map((item) => item.id === savedId ? { ...item, title: payload.title, updatedAt: new Date().toISOString() } : item));
        if (currentRef.current.document?.id === savedId && JSON.stringify(currentRef.current.document.content) === JSON.stringify(payload.content) && currentRef.current.document.title === payload.title) setDirty(false);
      } catch (saveError) { setSaveState('error'); setError(saveError.message); }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [document, dirty, activeUser]);

  // Automatically clear transient confirmation messages after a brief pause.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Create a blank page, refresh the list, and open the new document.
  async function createDocument() {
    setError('');
    try {
      const result = await api('/api/documents', { method: 'POST', body: JSON.stringify({ title: 'Untitled document' }) });
      await refreshDocuments(activeUser.id);
      await openDocument(result.document.id);
    } catch (createError) { setError(createError.message); }
  }

  // Upload a supported file and open the newly converted document.
  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const result = await api('/api/documents/import', { method: 'POST', body: formData });
      await refreshDocuments(activeUser.id);
      await openDocument(result.document.id);
      setToast('File imported as a new document');
    } catch (importError) { setError(importError.message); }
  }

  // Apply real local edits only; viewers and no-op editor updates stay clean.
  function updateDocument(patch) {
    const current = currentRef.current.document;
    if (!current || current.access === 'viewer') return;
    // Editor initialization can emit the existing content; only real changes should autosave.
    const unchanged = Object.entries(patch).every(([key, value]) => JSON.stringify(current[key]) === JSON.stringify(value));
    if (unchanged) return;
    const nextDocument = { ...current, ...patch };
    currentRef.current = { ...currentRef.current, document: nextDocument, dirty: true };
    setDocument(nextDocument);
    setDirty(true);
  }

  // Persist the owner's role change only after all pending document edits are saved.
  async function shareDocument(userId, role) {
    if (!(await flushCurrent())) throw new Error('Save your latest changes before changing access.');
    setBusy(true);
    try {
      const result = await api(`/api/documents/${document.id}/shares`, { method: 'POST', body: JSON.stringify({ userId, role }) });
      setDocument(result.document);
      setDirty(false);
      await refreshDocuments(activeUser.id);
    } finally { setBusy(false); }
  }

  // Remove collaborator access after flushing document edits.
  async function revokeShare(userId) {
    if (!(await flushCurrent())) return;
    setBusy(true);
    try {
      const result = await api(`/api/documents/${document.id}/shares/${userId}`, { method: 'DELETE' });
      setDocument(result.document);
      await refreshDocuments(activeUser.id);
    } catch (shareError) { setError(shareError.message); } finally { setBusy(false); }
  }

  // Flush the current document before loading the workspace as another demo user.
  async function changeAccount(user) {
    if (user.id === activeUser.id) { setUserMenuOpen(false); return; }
    if (!(await flushCurrent())) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      await api('/api/logout', { method: 'POST' });
      setAuthUserId(user.id);
      setActiveUser(null);
      setUserMenuOpen(false);
    } catch (logoutError) {
      setAuthError(logoutError.message);
    } finally { setAuthBusy(false); }
  }

  // Establish a server-side session before loading documents for the selected account.
  async function login(userId, password) {
    setAuthBusy(true);
    setAuthError('');
    try {
      const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ userId, password }) });
      setAuthUserId(result.user.id);
      setActiveUser(result.user);
    } catch (loginError) {
      setAuthError(loginError.message);
      throw loginError;
    } finally { setAuthBusy(false); }
  }

  const owned = documents.filter((item) => item.ownerId === activeUser?.id);
  const shared = documents.filter((item) => item.ownerId !== activeUser?.id);
  const readOnly = document?.access === 'viewer';
  const ownerCanShare = document?.access === 'owner';

  if (loading && !users.length) {
    return <main className="login-screen"><div className="loading-state"><LoaderCircle className="spin" size={22} /><span>Connecting to your workspace</span></div></main>;
  }

  if (!activeUser) {
    return <LoginScreen users={users} selectedUserId={authUserId} onSelectUser={setAuthUserId} onLogin={login} busy={authBusy} error={authError || error} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><span /></div><span>ajaia<span className="brand-light"> / notes</span></span></div>
        <button className="new-document-button" type="button" onClick={createDocument}><FilePlus2 size={17} />New document</button>
        <button className="import-button" type="button" onClick={() => fileInput.current?.click()}><Upload size={16} />Import a file</button>
        <input ref={fileInput} className="visually-hidden" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={importFile} />
        <nav className="document-nav" aria-label="Documents">
          <div className="nav-section"><div className="nav-label"><span>Your workspace</span><span>{owned.length}</span></div>
            {owned.length ? owned.map((item) => <button key={item.id} className={`document-link ${item.id === selectedId ? 'selected' : ''}`} type="button" onClick={() => openDocument(item.id)}><FileText size={16} /><span>{item.title}</span></button>) : <p className="nav-empty">Your documents appear here.</p>}
          </div>
          <div className="nav-section shared-section"><div className="nav-label"><span>Shared with you</span><span>{shared.length}</span></div>
            {shared.length ? shared.map((item) => <button key={item.id} className={`document-link ${item.id === selectedId ? 'selected' : ''}`} type="button" onClick={() => openDocument(item.id)}><FolderOpen size={16} /><span>{item.title}</span></button>) : <p className="nav-empty">Pages teammates share will land here.</p>}
          </div>
        </nav>
        <div className="sidebar-bottom">
          <button className={`account-button ${userMenuOpen ? 'is-open' : ''}`} type="button" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)}>
            <Avatar user={activeUser} /><span className="account-copy"><strong>{activeUser?.name || 'Loading account'}</strong><small>Demo workspace</small></span><ChevronDown size={16} />
          </button>
          {userMenuOpen && <div className="account-menu" role="menu">{users.map((user) => <button key={user.id} type="button" role="menuitem" onClick={() => changeAccount(user)}><Avatar user={user} size="small" /><span>{user.name}</span>{user.id === activeUser?.id && <Check size={15} />}</button>)}</div>}
          <div className="workspace-note"><span className="online-dot" />Workspace is up to date</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronLeft size={14} className="crumb-slash" /><span className="crumb-current">{document?.title || 'Documents'}</span></div><div className="topbar-actions"><div className={`save-indicator ${saveState}`} aria-live="polite">{saveState === 'saving' ? <LoaderCircle size={15} className="spin" /> : saveState === 'error' ? <CircleHelp size={15} /> : <Check size={15} />}<span>{saveState === 'saving' ? 'Saving' : saveState === 'error' ? 'Save failed' : 'Saved'}</span></div>{ownerCanShare && <button className="share-button" type="button" onClick={() => setShareOpen(true)}><Share2 size={16} />Share</button>}<button className="help-button" type="button" title="Demo workspace help" aria-label="Demo workspace information" onClick={() => setToast('This workspace uses seeded demo accounts.')}><CircleHelp size={17} /></button></div></header>
        <div className="editor-scroll">
          {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" type="button" aria-label="Dismiss error" onClick={() => setError('')}><X size={17} /></button></div>}
          {loading || (selectedId && !document) ? <div className="loading-state"><LoaderCircle className="spin" size={22} /><span>Opening your workspace</span></div> : !document ? <div className="welcome-empty"><div className="empty-icon"><FileText size={25} /></div><p className="eyebrow">A FRESH PAGE</p><h1>Make room for a good idea.</h1><p>Create a document or import a Markdown or text file to get started.</p><button className="primary-button" type="button" onClick={createDocument}><FilePlus2 size={16} />Create a document</button></div> : <article className="document-page">
            <div className="document-meta"><span className="access-mark"><span className="online-dot" />{readOnly ? 'Shared with you · View only' : document.access === 'editor' ? 'Shared with you · Editor' : document.sharedWith?.length ? `Shared with ${document.sharedWith.length} teammate${document.sharedWith.length === 1 ? '' : 's'}` : 'Private to you'}</span><span className="meta-dot">·</span><span className="last-edited"><Clock3 size={13} />{updatedLabel(document.updatedAt)}</span>{document.access !== 'owner' && <span className="meta-owner"><Avatar user={document.owner} size="tiny" />{document.owner?.name}</span>}</div>
            <input className="document-title" aria-label="Document title" value={document.title} maxLength={120} readOnly={readOnly} onChange={(event) => updateDocument({ title: event.target.value })} placeholder="Untitled document" />
            <div className="document-byline"><span>Owned by {document.owner?.name || activeUser?.name}</span><span className="byline-divider" /><span>{readOnly ? 'View access' : 'Changes save automatically'}</span></div>
            <RichEditor content={document.content} editable={!readOnly} onChange={(content) => updateDocument({ content })} />
            <footer className="document-footer"><span>{readOnly ? 'You have view-only access to this document.' : 'Just you and your collaborators, making progress.'}</span><span><LockKeyhole size={13} />Workspace only</span></footer>
          </article>}
        </div>
        <footer className="global-footer"><span>ajaia notes</span><span><span className="online-dot" />{saveState === 'saving' ? 'Saving changes' : saveState === 'error' ? 'Save needs attention' : 'All changes saved to this workspace'}</span></footer>
      </main>
      {shareOpen && document && <ShareDialog document={document} users={users} activeUser={activeUser} onClose={() => setShareOpen(false)} onShare={shareDocument} onRevoke={revokeShare} busy={busy} />}
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  );
}

export default App;
