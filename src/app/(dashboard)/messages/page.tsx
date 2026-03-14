'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon, icons } from '@/components/ui/Icon';
import { Btn } from '@/components/ui/Btn';
import { Modal } from '@/components/ui/Modal';
import type { Customer, SmsMessage } from '@/lib/types';

interface Conversation {
  phone_number: string;
  customer_id: string | null;
  customer_name: string | null;
  last_message: string;
  last_direction: string;
  last_at: string;
  message_count: number;
  has_unread: boolean;
}

interface ThreadData {
  phone_number: string;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  messages: SmsMessage[];
}

const inputCls =
  'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatFullTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Active thread
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  // Compose
  const [composeText, setComposeText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLTextAreaElement>(null);

  // Link customer modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkPhone, setLinkPhone] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [custSearching, setCustSearching] = useState(false);

  // New message modal
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [newMsgPhone, setNewMsgPhone] = useState('');
  const [newMsgCustSearch, setNewMsgCustSearch] = useState('');
  const [newMsgCustResults, setNewMsgCustResults] = useState<Customer[]>([]);
  const [newMsgSearching, setNewMsgSearching] = useState(false);
  const [newMsgCustomer, setNewMsgCustomer] = useState<Customer | null>(null);

  // Fetch conversations
  const fetchConversations = useCallback(async (q: string) => {
    const url = q ? `/api/messages?q=${encodeURIComponent(q)}` : '/api/messages';
    const res = await fetch(url);
    if (res.ok) {
      setConversations(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchConversations(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchConversations]);

  // Open thread
  const openThread = useCallback(async (phone: string) => {
    setActivePhone(phone);
    setThreadLoading(true);
    setComposeText('');
    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(phone)}`);
      if (res.ok) {
        setThread(await res.json());
      }
    } finally {
      setThreadLoading(false);
    }
  }, []);

  // Auto-scroll to bottom when thread loads or new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages]);

  // Send message
  const handleSend = async () => {
    if (!composeText.trim() || !activePhone || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activePhone,
          message: composeText.trim(),
          customer_id: thread?.customer?.id || null,
        }),
      });
      if (res.ok) {
        setComposeText('');
        // Refresh thread and conversation list
        await openThread(activePhone);
        await fetchConversations(search);
      }
    } finally {
      setSending(false);
      composeRef.current?.focus();
    }
  };

  // Link customer search
  useEffect(() => {
    if (!custSearch || custSearch.length < 2) {
      setCustResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setCustSearching(true);
      const res = await fetch(`/api/customers?q=${encodeURIComponent(custSearch)}`);
      if (res.ok) {
        const json = await res.json();
        setCustResults(Array.isArray(json) ? json : json.data ?? []);
      }
      setCustSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [custSearch]);

  const handleLinkCustomer = async (customerId: string) => {
    await fetch(`/api/messages/${encodeURIComponent(linkPhone)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId }),
    });
    setShowLinkModal(false);
    setCustSearch('');
    setCustResults([]);
    // Refresh
    await fetchConversations(search);
    if (activePhone) await openThread(activePhone);
  };

  // New message customer search
  useEffect(() => {
    if (!newMsgCustSearch || newMsgCustSearch.length < 2) {
      setNewMsgCustResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setNewMsgSearching(true);
      const res = await fetch(`/api/customers?q=${encodeURIComponent(newMsgCustSearch)}`);
      if (res.ok) {
        const json = await res.json();
        setNewMsgCustResults(Array.isArray(json) ? json : json.data ?? []);
      }
      setNewMsgSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [newMsgCustSearch]);

  const startNewConversation = () => {
    if (!newMsgCustomer?.phone && !newMsgPhone.trim()) return;
    const phone = newMsgCustomer?.phone || newMsgPhone.trim();
    setShowNewMsg(false);
    setNewMsgPhone('');
    setNewMsgCustSearch('');
    setNewMsgCustResults([]);
    setNewMsgCustomer(null);
    openThread(phone);
  };

  // Group messages by date
  const groupedMessages: { date: string; msgs: SmsMessage[] }[] = [];
  if (thread?.messages) {
    let currentDate = '';
    for (const msg of thread.messages) {
      const date = formatDate(msg.created_at);
      if (date !== currentDate) {
        currentDate = date;
        groupedMessages.push({ date, msgs: [msg] });
      } else {
        groupedMessages[groupedMessages.length - 1].msgs.push(msg);
      }
    }
  }

  const activeConv = conversations.find(
    (c) => c.phone_number === activePhone
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0 overflow-hidden -m-4 md:-m-6">
      {/* Left panel — Conversation list */}
      <div className="w-full sm:w-[340px] lg:w-[380px] flex-shrink-0 border-r border-bdr flex flex-col bg-surface">
        {/* Header */}
        <div className="p-4 border-b border-bdr space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="font-heading text-lg font-bold text-white tracking-wide">Messages</h1>
            <Btn small onClick={() => setShowNewMsg(true)}>
              <span className="flex items-center gap-1.5">
                <Icon d={icons.plus} size={14} />
                New
              </span>
            </Btn>
          </div>
          <div className="relative">
            <Icon
              d={icons.search}
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg border border-bdr rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50"
              placeholder="Search by name or phone..."
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              {search ? 'No conversations match your search' : 'No messages yet'}
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.phone_number === activePhone;
              return (
                <button
                  key={conv.phone_number}
                  onClick={() => openThread(conv.phone_number)}
                  className={`w-full text-left px-4 py-3 border-b border-bdr/50 hover:bg-bg/50 transition ${
                    isActive ? 'bg-bg/80' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Unread indicator */}
                    <div className="mt-1.5 flex-shrink-0">
                      {conv.has_unread ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-accent" />
                      ) : (
                        <div className="w-2.5 h-2.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-medium truncate ${
                            conv.has_unread ? 'text-white' : 'text-slate-300'
                          }`}
                        >
                          {conv.customer_name || formatPhoneDisplay(conv.phone_number)}
                        </span>
                        <span className="text-[11px] text-slate-500 flex-shrink-0">
                          {formatTime(conv.last_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-xs text-slate-500 truncate">
                          {conv.last_direction === 'outbound' && (
                            <span className="text-slate-600 mr-1">You:</span>
                          )}
                          {conv.last_message}
                        </span>
                        {!conv.customer_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLinkPhone(conv.phone_number);
                              setShowLinkModal(true);
                            }}
                            className="text-[10px] text-accent hover:text-accent/80 font-semibold uppercase flex-shrink-0"
                          >
                            Link
                          </button>
                        )}
                      </div>
                      {!conv.customer_id && conv.customer_name === null && (
                        <div className="text-[10px] text-slate-600 mt-0.5">
                          {formatPhoneDisplay(conv.phone_number)}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel — Thread */}
      <div className="flex-1 flex flex-col bg-bg min-w-0 hidden sm:flex">
        {!activePhone ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-600">
              <Icon d={icons.message} size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a conversation</p>
            </div>
          </div>
        ) : threadLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-slate-500">Loading...</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-5 py-3 border-b border-bdr flex items-center justify-between bg-surface">
              <div>
                <h2 className="font-heading text-base font-bold text-white">
                  {thread?.customer?.name ||
                    activeConv?.customer_name ||
                    formatPhoneDisplay(activePhone)}
                </h2>
                <p className="text-xs text-slate-500">{formatPhoneDisplay(activePhone)}</p>
              </div>
              {!thread?.customer && (
                <Btn
                  small
                  variant="secondary"
                  onClick={() => {
                    setLinkPhone(activePhone);
                    setShowLinkModal(true);
                  }}
                >
                  Link Customer
                </Btn>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {groupedMessages.length === 0 ? (
                <div className="text-center text-sm text-slate-600 py-12">
                  No messages yet. Send one below.
                </div>
              ) : (
                groupedMessages.map((group) => (
                  <div key={group.date}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-bdr" />
                      <span className="text-[10px] text-slate-600 uppercase font-heading tracking-wider">
                        {group.date}
                      </span>
                      <div className="flex-1 h-px bg-bdr" />
                    </div>

                    {/* Messages */}
                    <div className="space-y-2">
                      {group.msgs.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                              msg.direction === 'outbound'
                                ? 'bg-accent/20 text-slate-200 rounded-br-md'
                                : 'bg-surface border border-bdr text-slate-300 rounded-bl-md'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                            <p
                              className={`text-[10px] mt-1 ${
                                msg.direction === 'outbound' ? 'text-accent/50' : 'text-slate-600'
                              }`}
                            >
                              {formatFullTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose bar */}
            <div className="px-5 py-3 border-t border-bdr bg-surface">
              <div className="flex items-end gap-3">
                <textarea
                  ref={composeRef}
                  value={composeText}
                  onChange={(e) => setComposeText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  className="flex-1 bg-bg border border-bdr rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 resize-none max-h-24 font-body"
                  placeholder="Type a message... (Enter to send)"
                />
                <Btn onClick={handleSend} disabled={!composeText.trim() || sending}>
                  <Icon d={icons.send} size={16} />
                </Btn>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Link Customer Modal */}
      <Modal open={showLinkModal} onClose={() => { setShowLinkModal(false); setCustSearch(''); setCustResults([]); }} title="Link to Customer">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Link messages from <span className="text-white font-medium">{formatPhoneDisplay(linkPhone)}</span> to a customer.
          </p>
          <input
            value={custSearch}
            onChange={(e) => setCustSearch(e.target.value)}
            className={inputCls}
            placeholder="Search customers by name..."
            autoFocus
          />
          {custSearching && <p className="text-xs text-slate-500">Searching...</p>}
          {custResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {custResults.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleLinkCustomer(c.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-surface transition flex items-center justify-between"
                >
                  <div>
                    <span className="text-sm text-white font-medium">{c.name}</span>
                    {c.phone && (
                      <span className="text-xs text-slate-500 ml-2">{c.phone}</span>
                    )}
                  </div>
                  <Icon d={icons.chevRight} size={14} className="text-slate-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* New Message Modal */}
      <Modal open={showNewMsg} onClose={() => { setShowNewMsg(false); setNewMsgPhone(''); setNewMsgCustSearch(''); setNewMsgCustResults([]); setNewMsgCustomer(null); }} title="New Message">
        <div className="space-y-4">
          {newMsgCustomer ? (
            <div className="flex items-center justify-between bg-surface border border-bdr rounded-lg px-3 py-2.5">
              <div>
                <span className="text-sm text-white font-medium">{newMsgCustomer.name}</span>
                <span className="text-xs text-slate-500 ml-2">{newMsgCustomer.phone}</span>
              </div>
              <button
                onClick={() => setNewMsgCustomer(null)}
                className="text-slate-500 hover:text-white"
              >
                <Icon d={icons.x} size={14} />
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Search customer
                </label>
                <input
                  value={newMsgCustSearch}
                  onChange={(e) => setNewMsgCustSearch(e.target.value)}
                  className={inputCls}
                  placeholder="Type customer name..."
                  autoFocus
                />
                {newMsgSearching && <p className="text-xs text-slate-500 mt-1">Searching...</p>}
                {newMsgCustResults.length > 0 && (
                  <div className="max-h-36 overflow-y-auto space-y-1 mt-2">
                    {newMsgCustResults.filter((c) => c.phone).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setNewMsgCustomer(c);
                          setNewMsgCustSearch('');
                          setNewMsgCustResults([]);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface transition"
                      >
                        <span className="text-sm text-white font-medium">{c.name}</span>
                        <span className="text-xs text-slate-500 ml-2">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-bdr" />
                <span className="text-[10px] text-slate-600 uppercase">or</span>
                <div className="flex-1 h-px bg-bdr" />
              </div>
              <div>
                <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Phone number
                </label>
                <input
                  value={newMsgPhone}
                  onChange={(e) => setNewMsgPhone(e.target.value)}
                  className={inputCls}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Btn
              onClick={startNewConversation}
              disabled={!newMsgCustomer?.phone && !newMsgPhone.trim()}
            >
              Start Conversation
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
