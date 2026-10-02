'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

type Message = 
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string }
  | { role: 'system'; text: string; error?: boolean };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  exerciseId: string;
  getCurrentCode: () => string;
}

export default function AIHintModal({ isOpen, onClose, exerciseId, getCurrentCode }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!isOpen) {
      setMessages([]);
      setInput('');
      setCooldown(0);
    }
  }, [isOpen]);

  async function askHint() {
    if (loading || cooldown > 0) return;
    const code = getCurrentCode();
    const userMsg = input.trim();
    setLoading(true);
    setInput('');
    
    if (userMsg) setMessages(prev => [...prev, { role: 'user', text: userMsg }]);

    try {
      const res = await fetch('/api/ai-hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercise_id: exerciseId,
          code,
          user_message: userMsg || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessages(prev => [...prev, { 
          role: 'system', 
          text: json.error || 'خطا در دریافت راهنمایی', 
          error: true 
        }]);
        if (res.status === 429) setCooldown(30);
        // «همه‌ی مدل‌ها شلوغن» یعنی مشکل موقتی سمت provider است — cooldown کوتاه
        // تا دانشجو راحت دوباره امتحان کند.
        else if (res.status === 503 || /شلوغ/.test(json.error || '')) setCooldown(15);
        return;
      }

      setMessages(prev => [...prev, { role: 'assistant', text: json.response ?? json.hint ?? 'جوابی برنگشت. دوباره تلاش کن.' }]);
      if (typeof json.remaining === 'number') setRemaining(json.remaining);
      setCooldown(30);
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: 'system', 
        text: 'خطای شبکه. اتصالت رو چک کن.', 
        error: true 
      }]);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const canSend = !loading && cooldown === 0;

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-xl">
            🤖
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg">معلم کمکی هوشمند</h3>
            <p className="text-xs text-gray-500">
              {remaining !== null 
                ? `${remaining} راهنمایی امروز باقی مونده` 
                : 'هر روز ۱۰ راهنمایی می‌تونی بگیری'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 grid place-items-center text-gray-500"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
          {messages.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              <div className="text-4xl mb-3">💡</div>
              <p className="mb-2">سلام! من اینجام کمکت کنم.</p>
              <p className="text-xs">کدت رو بنویس و بزن «راهنمایی بگیر».</p>
              <p className="text-xs mt-1">من جواب کامل نمی‌دم، ولی مسیر رو نشونت می‌دم.</p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-blue-100 grid place-items-center text-sm flex-shrink-0">👤</div>
              )}
              <div 
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                  m.role === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : m.role === 'system'
                    ? m.error 
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-gray-100 text-gray-700'
                    : 'bg-violet-50 text-gray-800 border border-violet-200'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown>{m.text}</ReactMarkdown>
                  </div>
                ) : m.text}
              </div>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-violet-100 grid place-items-center text-sm flex-shrink-0">🤖</div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 justify-end">
              <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 flex gap-1.5 items-center">
                <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{animationDelay: '0ms'}}></span>
                <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{animationDelay: '150ms'}}></span>
                <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{animationDelay: '300ms'}}></span>
              </div>
              <div className="w-7 h-7 rounded-full bg-violet-100 grid place-items-center text-sm flex-shrink-0">🤖</div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t bg-gray-50 rounded-b-2xl">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && canSend) {
                  e.preventDefault();
                  askHint();
                }
              }}
              placeholder="سوال خاصی داری؟ (اختیاری)"
              disabled={loading || cooldown > 0}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm disabled:bg-gray-100"
            />
            <button
              onClick={askHint}
              disabled={!canSend}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-shadow"
            >
              {cooldown > 0 ? `${cooldown}s` : loading ? '...' : 'راهنمایی'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}