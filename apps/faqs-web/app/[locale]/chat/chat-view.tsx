'use client';

import {useState} from 'react';
import {Send, Plus} from 'lucide-react';

type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
};

const welcomeMessage: Message = {
    id: 'welcome',
    role: 'assistant',
    content: '你好！我是 FinAgents 智能助手，可以帮你解读研报、分析市场数据、构建量化策略。有什么可以帮你的？',
};

export function ChatView({isLoggedIn}: {isLoggedIn: boolean}) {
    const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
    const [input, setInput] = useState('');

    function handleSend() {
        if (!input.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
        };

        const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: '这是一个示例回复。实际的 AI 分析能力将在接入 LLM 服务后上线，届时支持研报解读、因子分析、市场观点总结等功能。',
        };

        setMessages((prev) => [...prev, userMsg, aiMsg]);
        setInput('');
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
                                    {msg.content}
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
                            disabled={!input.trim()}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
