import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import api from '../api';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';

const chatHeaders = (token) => ({ Authorization: `Bearer ${token}` });
const prettySize = (size) => {
  if (!size) return '';
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
};

function SignInCard({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError || !data.session) {
      setError(authError?.message || 'Could not sign in. Check your email and password.');
      return;
    }
    onSignedIn(data.session);
  };

  return (
    <div className="mx-auto mt-12 w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900/90 p-7 shadow-2xl">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
        <MessageCircle size={25} />
      </div>
      <h1 className="text-2xl font-bold text-white">Staff Chat</h1>
      <p className="mt-2 text-sm text-slate-400">Sign in with the staff account provided by your administrator.</p>
      <form onSubmit={signIn} className="mt-6 space-y-4">
        <label className="block text-sm text-slate-300">Email
          <input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-indigo-400" />
        </label>
        <label className="block text-sm text-slate-300">Password
          <input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-indigo-400" />
        </label>
        {error && <p role="alert" className="rounded-xl border border-red-800 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
          {busy ? <LoaderCircle className="animate-spin" size={18} /> : null} Sign in
        </button>
      </form>
    </div>
  );
}

function NewConversationDialog({ token, onClose, onCreated }) {
  const [kind, setKind] = useState('direct');
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api.get('/chat/staff', { params: { search }, headers: chatHeaders(token) })
      .then((response) => { if (live) setStaff(response.data.staff || []); })
      .catch((err) => { if (live) setError(err.response?.data?.detail || 'Could not load the staff list.'); });
    return () => { live = false; };
  }, [search, token]);

  const toggleStaff = (id) => {
    setSelected((current) => {
      if (kind === 'direct') return current.includes(id) ? [] : [id];
      return current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    });
  };

  const create = async () => {
    if (selected.length < 1) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.post('/chat/conversations', {
        kind,
        name: kind === 'group' ? name : null,
        member_staff_ids: selected,
      }, { headers: chatHeaders(token) });
      await onCreated(response.data.conversation.id);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create the conversation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="new-chat-title" className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 p-5">
          <div><h2 id="new-chat-title" className="text-lg font-semibold text-white">New conversation</h2><p className="mt-1 text-xs text-slate-400">Only active staff can be added.</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={19} /></button>
        </header>
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1">
            <button type="button" onClick={() => { setKind('direct'); setSelected((current) => current.slice(0, 1)); }} className={`rounded-lg px-3 py-2 text-sm ${kind === 'direct' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Direct message</button>
            <button type="button" onClick={() => setKind('group')} className={`rounded-lg px-3 py-2 text-sm ${kind === 'group' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Group chat</button>
          </div>
          {kind === 'group' && <input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Group name" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-indigo-400" />}
          <div className="relative"><Search className="absolute left-3 top-3 text-slate-500" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a staff member" className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-white outline-none focus:border-indigo-400" /></div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800">
            {staff.map((person) => {
              const checked = selected.includes(person.id);
              return <button type="button" key={person.id} onClick={() => toggleStaff(person.id)} className="flex w-full items-center gap-3 border-b border-slate-800 px-3 py-3 text-left last:border-b-0 hover:bg-slate-800/70">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${checked ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}>{person.full_name?.slice(0, 1)?.toUpperCase() || '?'}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{person.full_name}</span><span className="block text-xs text-slate-500">{person.staff_code}{person.department ? ` · ${person.department}` : ''}</span></span>
                {kind === 'group' && <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${checked ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-slate-600 text-transparent'}`}>✓</span>}
                {kind === 'direct' && checked && <span className="text-xs text-indigo-300">Selected</span>}
              </button>;
            })}
            {!staff.length && <p className="p-4 text-sm text-slate-500">No staff found.</p>}
          </div>
          {kind === 'group' && <p className="text-xs text-slate-500">{selected.length + 1} members including you · maximum 50</p>}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-800 p-5">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
          <button type="button" onClick={create} disabled={busy || selected.length === 0 || (kind === 'group' && !name.trim())} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Creating…' : 'Start chat'}</button>
        </footer>
      </section>
    </div>
  );
}

export default function StaffChat() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [staffProfile, setStaffProfile] = useState(null);
  const [authError, setAuthError] = useState('');
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const bottomRef = useRef(null);
  const token = session?.access_token;

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || null,
    [conversations, selectedId],
  );

  const loadConversations = useCallback(async () => {
    if (!token) return;
    const response = await api.get('/chat/conversations', { headers: chatHeaders(token) });
    setConversations(response.data.conversations || []);
    return response.data.conversations || [];
  }, [token]);

  const loadMessages = useCallback(async (conversationId, before) => {
    if (!token || !conversationId) return [];
    const response = await api.get(`/chat/conversations/${conversationId}/messages`, {
      headers: chatHeaders(token),
      params: before ? { before } : undefined,
    });
    setHasMore(Boolean(response.data.has_more));
    setMessages((current) => before ? [...(response.data.messages || []), ...current] : (response.data.messages || []));
    return response.data.messages || [];
  }, [token]);

  const connectSession = useCallback(async (nextSession) => {
    setSession(nextSession);
    setAuthError('');
    try {
      const response = await api.get('/chat/me', { headers: chatHeaders(nextSession.access_token) });
      setStaffProfile(response.data.staff);
      const listResponse = await api.get('/chat/conversations', { headers: chatHeaders(nextSession.access_token) });
      const list = listResponse.data.conversations || [];
      setConversations(list);
      setSelectedId((current) => current || list[0]?.id || null);
    } catch (error) {
      setStaffProfile(null);
      setAuthError(error.response?.data?.detail || 'Could not verify the linked staff account.');
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      if (data.session) connectSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!live) return;
      setSession(nextSession);
      if (nextSession) connectSession(nextSession);
      else {
        setStaffProfile(null);
        setConversations([]);
        setSelectedId(null);
        setMessages([]);
      }
    });
    return () => {
      live = false;
      listener.subscription.unsubscribe();
    };
  }, [connectSession]);

  useEffect(() => {
    if (!token || !selectedId || !staffProfile) {
      setMessages([]);
      return undefined;
    }
    let live = true;
    setLoadingMessages(true);
    setChatError('');
    (async () => {
      await loadMessages(selectedId);
      await api.post(`/chat/conversations/${selectedId}/read`, {}, { headers: chatHeaders(token) });
      await loadConversations();
    })().catch((error) => {
      if (live) setChatError(error.response?.data?.detail || 'Could not load this conversation.');
    }).finally(() => { if (live) setLoadingMessages(false); });

    return () => {
      live = false;
    };
  }, [token, selectedId, staffProfile, loadMessages, loadConversations]);

  useEffect(() => {
    if (!token || !staffProfile || !supabase) return undefined;
    let live = true;
    setRealtimeStatus('connecting');
    supabase.realtime.setAuth(token);
    const channel = supabase.channel(`chat-inbox:${staffProfile.id}`, { config: { private: true } })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      }, (change) => {
        if (change.new?.conversation_id === selectedId) {
          loadMessages(selectedId).catch(() => {});
        }
        loadConversations().catch(() => {});
      })
      .subscribe((status) => {
        if (live) setRealtimeStatus(status === 'SUBSCRIBED' ? 'connected' : status.toLowerCase());
      });
    return () => {
      live = false;
      supabase.removeChannel(channel);
    };
  }, [token, staffProfile, selectedId, loadMessages, loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, selectedId]);

  const submitMessage = async (event) => {
    event.preventDefault();
    if (!selectedId || (!draft.trim() && !attachment) || sending) return;
    setSending(true);
    setChatError('');
    const form = new FormData();
    form.append('body', draft.trim());
    if (attachment) form.append('file', attachment);
    try {
      await api.post(`/chat/conversations/${selectedId}/messages`, form, {
        headers: { ...chatHeaders(token), 'Content-Type': 'multipart/form-data' },
      });
      await loadMessages(selectedId);
      setDraft('');
      setAttachment(null);
      const picker = document.getElementById('chat-attachment-picker');
      if (picker) picker.value = '';
      await loadConversations();
    } catch (error) {
      setChatError(error.response?.data?.detail || 'Message could not be saved. Try again.');
    } finally {
      setSending(false);
    }
  };

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest || !hasMore) return;
    setLoadingMessages(true);
    try { await loadMessages(selectedId, oldest.created_at); }
    catch (error) { setChatError(error.response?.data?.detail || 'Could not load older messages.'); }
    finally { setLoadingMessages(false); }
  };

  const openAttachment = async (message) => {
    try {
      const response = await api.get(`/chat/messages/${message.id}/attachment`, { headers: chatHeaders(token) });
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setChatError(error.response?.data?.detail || 'Could not open that attachment.');
    }
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setStaffProfile(null);
    setAuthError('');
  };

  const filteredConversations = conversations.filter((conversation) =>
    conversation.display_name?.toLowerCase().includes(listSearch.toLowerCase()),
  );
  const staffNameById = Object.fromEntries((selectedConversation?.members || []).map(({ staff }) => [staff.id, staff.full_name]));

  if (!supabaseConfigured) {
    return <main className="mx-auto max-w-3xl px-4 py-10"><div role="alert" className="rounded-2xl border border-amber-700 bg-amber-950/50 p-6 text-amber-100"><h1 className="text-xl font-bold">Staff Chat needs setup</h1><p className="mt-2 text-sm">Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the frontend, then apply the reviewed staff chat migration and link staff accounts.</p></div></main>;
  }
  if (!authReady) return <main className="flex min-h-[60vh] items-center justify-center text-slate-400"><LoaderCircle className="mr-2 animate-spin" /> Loading secure chat…</main>;
  if (!session) return <main className="px-4 py-8"><SignInCard onSignedIn={connectSession} /></main>;

  return (
    <main className="mx-auto max-w-7xl px-3 pb-8 pt-5 sm:px-6">
      {authError && <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-700 bg-amber-950/50 p-4 text-sm text-amber-100"><span>{authError}. Ask an administrator to link your account to your staff record.</span><button type="button" onClick={signOut} className="shrink-0 underline">Sign out</button></div>}
      {staffProfile && <div className="flex h-[min(78vh,820px)] min-h-[560px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <aside className={`${selectedConversation ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-slate-800 bg-slate-900 md:w-[340px]`}>
          <header className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
            <div><h1 className="text-lg font-bold text-white">Chats</h1><p className="text-xs text-slate-500">{staffProfile.full_name}</p></div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setShowNewChat(true)} title="New conversation" className="rounded-xl bg-indigo-600 p-2.5 text-white hover:bg-indigo-500"><Plus size={19} /></button>
              <button type="button" onClick={signOut} title="Sign out" className="rounded-xl p-2.5 text-slate-400 hover:bg-slate-800 hover:text-white"><LogOut size={18} /></button>
            </div>
          </header>
          <div className="p-3"><div className="relative"><Search className="absolute left-3 top-2.5 text-slate-500" size={17} /><input aria-label="Search conversations" value={listSearch} onChange={(event) => setListSearch(event.target.value)} placeholder="Search conversations" className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-10 pr-3 text-sm text-white outline-none focus:border-indigo-500" /></div></div>
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.map((conversation) => <button type="button" key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`flex w-full items-start gap-3 border-b border-slate-800/80 px-4 py-4 text-left hover:bg-slate-800/60 ${conversation.id === selectedId ? 'bg-slate-800/80' : ''}`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">{conversation.kind === 'group' ? <Users size={20} /> : <MessageCircle size={20} />}</span>
              <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-white">{conversation.display_name}</span>{conversation.unread_count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-bold text-white">{conversation.unread_count}</span>}</span><span className="mt-1 block truncate text-xs text-slate-400">{conversation.last_message?.body || conversation.last_message?.attachment_name || 'Start a conversation'}</span></span>
            </button>)}
            {!filteredConversations.length && <div className="px-5 py-10 text-center text-sm text-slate-500">No conversations yet. Start one with the + button.</div>}
          </div>
        </aside>

        <section className={`${selectedConversation ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-slate-950`}>
          {selectedConversation ? <>
            <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
              <button type="button" onClick={() => setSelectedId(null)} className="mr-1 rounded-lg p-2 text-slate-400 hover:bg-slate-800 md:hidden" aria-label="Back to conversations">‹</button>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">{selectedConversation.kind === 'group' ? <Users size={19} /> : <MessageCircle size={19} />}</span>
              <div className="min-w-0 flex-1"><h2 className="truncate font-semibold text-white">{selectedConversation.display_name}</h2><p className="truncate text-xs text-slate-500">{selectedConversation.members.map(({ staff }) => staff.full_name).join(', ')}</p></div>
              <span className={`hidden text-xs sm:inline ${realtimeStatus === 'connected' ? 'text-emerald-400' : 'text-amber-300'}`}>{realtimeStatus === 'connected' ? 'Live' : 'Reconnecting'}</span>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-5 sm:px-6">
              {hasMore && <div className="text-center"><button type="button" disabled={loadingMessages} onClick={loadOlder} className="rounded-lg px-3 py-2 text-xs text-indigo-300 hover:bg-slate-900 disabled:opacity-50">Load older messages</button></div>}
              {loadingMessages && !messages.length && <p className="text-center text-sm text-slate-500">Loading messages…</p>}
              {!messages.length && !loadingMessages && <div className="flex h-full min-h-40 flex-col items-center justify-center text-center"><span className="mb-3 rounded-full bg-slate-900 p-4 text-slate-500"><MessageCircle size={25} /></span><p className="text-sm text-slate-400">This is the beginning of the conversation.</p></div>}
              {messages.map((message) => {
                const own = message.sender_staff_id === staffProfile.id;
                return <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                  <article className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow sm:max-w-[75%] ${own ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md border border-slate-800 bg-slate-900 text-slate-100'}`}>
                    {!own && <p className="mb-1 text-xs font-semibold text-indigo-300">{staffNameById[message.sender_staff_id] || 'Staff member'}</p>}
                    {message.body && <p className="whitespace-pre-wrap break-words text-sm">{message.deleted_at ? 'Message removed' : message.body}</p>}
                    {message.attachment_name && <button type="button" onClick={() => openAttachment(message)} className={`mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-left ${own ? 'border-indigo-400/50 bg-indigo-700/60' : 'border-slate-700 bg-slate-950/70'}`}><span className="text-indigo-200">{message.attachment_content_type?.startsWith('image/') ? <ImageIcon size={18} /> : <FileText size={18} />}</span><span className="min-w-0"><span className="block max-w-64 truncate text-xs font-medium">{message.attachment_name}</span><span className="block text-[10px] opacity-70">{prettySize(message.attachment_size)} · secure download</span></span></button>}
                    <time className={`mt-1 block text-right text-[10px] ${own ? 'text-indigo-100/70' : 'text-slate-500'}`}>{new Date(message.created_at).toLocaleString([], { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}</time>
                  </article>
                </div>;
              })}
              <div ref={bottomRef} />
            </div>
            {chatError && <p role="alert" className="mx-4 mb-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">{chatError}</p>}
            <form onSubmit={submitMessage} className="border-t border-slate-800 bg-slate-900 p-3 sm:p-4">
              {attachment && <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs text-slate-300"><Paperclip size={14} /><span className="min-w-0 flex-1 truncate">{attachment.name} · {prettySize(attachment.size)}</span><button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment"><X size={15} /></button></div>}
              <div className="flex items-end gap-2">
                <label htmlFor="chat-attachment-picker" title="Attach a photo, video, PDF, or text file" className="cursor-pointer rounded-xl p-3 text-slate-400 hover:bg-slate-800 hover:text-white"><Paperclip size={20} /><span className="sr-only">Attach a file</span></label>
                <input id="chat-attachment-picker" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf,text/plain" className="hidden" onChange={(event) => setAttachment(event.target.files?.[0] || null)} />
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitMessage(event); } }} rows={1} maxLength={5000} placeholder="Write a message…" className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-indigo-500" />
                <button type="submit" disabled={sending || (!draft.trim() && !attachment)} title="Send message" className="rounded-xl bg-indigo-600 p-3 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">{sending ? <LoaderCircle className="animate-spin" size={20} /> : <Send size={20} />}</button>
              </div>
              <p className="mt-2 pl-2 text-[10px] text-slate-600">Files: photos, MP4/MOV, PDF, or plain text · maximum 20 MB</p>
            </form>
          </> : <div className="hidden flex-1 flex-col items-center justify-center text-center md:flex"><span className="mb-4 rounded-full border border-slate-800 bg-slate-900 p-6 text-indigo-300"><MessageCircle size={34} /></span><h2 className="text-lg font-semibold text-white">Your staff conversations</h2><p className="mt-2 max-w-sm text-sm text-slate-500">Choose a chat or start a new direct or group conversation.</p><button type="button" onClick={() => setShowNewChat(true)} className="mt-5 flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"><Plus size={17} /> New conversation</button></div>}
        </section>
      </div>}
      {showNewChat && <NewConversationDialog token={token} onClose={() => setShowNewChat(false)} onCreated={async (id) => { const list = await loadConversations(); setSelectedId(id || list?.[0]?.id || null); }} />}
    </main>
  );
}
