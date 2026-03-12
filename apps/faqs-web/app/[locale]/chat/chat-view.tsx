'use client';

import {useState} from 'react';
import {Loader2, Plus, Send} from 'lucide-react';

type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    reasoningPaths?: string[][];
    references?: {
        entities: Array<{id: string; name: string; type: string}>;
        stocks: Array<{stockCode: string; stockName: string}>;
    };
};

const welcomeMessage: Message = {
    id: 'welcome',
    role: 'assistant',
    content: '你好！我是 FinAgents 投研助手，可以结合新闻与行业知识图谱回答行业、产业链和股票相关问题。',
};

export function ChatView({isLoggedIn}: {isLoggedIn: boolean}) {
    const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
    const [input, setInput] = useState('');
    const [sessionId, setSessionId] = useState<string>();
    const [loading, setLoading] = useState(false);

    async function handleSend() {
        if (!input.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput('');

        setLoading(true);
        try {
            const response = await fetch('/api/research/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    sessionId,
                    message: userMsg.content,
                }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error?.message ?? '对话分析失败，请稍后重试');
            }

            setSessionId(payload.sessionId);
            setMessages((prev) => [
                ...prev,
                {
                    id: payload.messageId,
                    role: 'assistant',
                    content: payload.answer.text,
                    reasoningPaths: payload.answer.reasoningPaths,
                    references: payload.answer.references,
                },
            ]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    id: `${Date.now()}-error`,
                    role: 'assistant',
                    content: error instanceof Error ? error.message : '对话分析失败，请稍后重试。',
                },
            ]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex h-[calc(100vh-48px-56px)] flex-col lg:h-[calc(100vh-56px)] lg:flex-row">
            {/* 侧边栏 - 桌面端 + 登录后 */}
            {isLoggedIn && (
                <aside className="hidden w-60 shrink-0 border-r border-border bg-bg-card lg:block">
                    <div className="flex h-12 items-center justify-between border-b border-border px-4">
                        <span className="text-xs font-medium text-text-secondary">历史记录</span>
                        <button className="text-text-secondary hover:text-accent transition-colors">
                            <Plus className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="space-y-0.5 p-2">
                        {['沪深300增强策略讨论', '研报观点对比分析', 'VaR模型参数调优'].map((title, i) => (
                            <button
                                key={i}
                                className={`w-full truncate rounded-md px-3 py-2 text-left text-xs transition-colors ${
                                    i === 0
                                        ? 'bg-bg-hover text-text-primary'
                                        : 'text-text-secondary hover:bg-bg-hover'
                                }`}
                            >
                                {title}
                            </button>
                        ))}
                    </div>
                </aside>
            )}

            {/* 聊天主区 */}
            <div className="flex flex-1 flex-col">
                {/* 消息区 */}
                <div className="flex-1 overflow-y-auto px-4 py-4">
                    <div className="mx-auto max-w-3xl space-y-4">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                        msg.role === 'user'
                                            ? 'bg-bg-hover text-text-primary'
                                            : 'bg-bg-card text-text-primary'
                                    }`}
                                >
                                    <div>{msg.content}</div>
                                    {msg.reasoningPaths && msg.reasoningPaths.length > 0 && (
                                        <div className="mt-3 space-y-2 rounded-xl bg-bg-base/70 p-3">
                                            <div className="text-[11px] uppercase tracking-wide text-text-secondary">推理路径</div>
                                            {msg.reasoningPaths.map((path, index) => (
                                                <div key={`${path.join('-')}-${index}`} className="text-xs text-text-secondary">
                                                    {path.join(' -> ')}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {msg.references && (
                                        <div className="mt-3 space-y-2 rounded-xl bg-bg-base/70 p-3">
                                            <div className="text-[11px] uppercase tracking-wide text-text-secondary">引用</div>
                                            {msg.references.entities.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {msg.references.entities.map((entity) => (
                                                        <span
                                                            key={entity.id}
                                                            className="rounded-md bg-bg-hover px-2 py-1 text-xs text-text-secondary"
                                                        >
                                                            {entity.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {msg.references.stocks.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {msg.references.stocks.map((stock) => (
                                                        <span
                                                            key={`${stock.stockCode}-${stock.stockName}`}
                                                            className="rounded-md bg-accent/10 px-2 py-1 text-xs text-accent"
                                                        >
                                                            {stock.stockName} {stock.stockCode}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 输入区 */}
                <div className="border-t border-border bg-bg-card px-4 py-3">
                    <div className="mx-auto flex max-w-3xl items-center gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                            placeholder="输入消息..."
                            className="flex-1 rounded-full border border-border bg-bg-base px-4 py-2.5 text-sm text-text-primary placeholder:text-text-disabled transition-colors focus:border-accent focus:outline-none"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || loading}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
