'use client';

import {useEffect, useRef} from 'react';
import {Flame} from 'lucide-react';

interface TickerItem {
    id: string;
    title: string;
    importance: number;
}

export function NewsTicker({items}: {items: TickerItem[]}) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el || items.length === 0) return;

        let animationId: number;
        let scrollPos = 0;
        const speed = 0.5;

        function animate() {
            if (!el) return;
            scrollPos += speed;
            if (scrollPos >= el.scrollWidth / 2) {
                scrollPos = 0;
            }
            el.scrollLeft = scrollPos;
            animationId = requestAnimationFrame(animate);
        }

        animationId = requestAnimationFrame(animate);

        const handleEnter = () => cancelAnimationFrame(animationId);
        const handleLeave = () => {
            animationId = requestAnimationFrame(animate);
        };

        el.addEventListener('mouseenter', handleEnter);
        el.addEventListener('mouseleave', handleLeave);

        return () => {
            cancelAnimationFrame(animationId);
            el.removeEventListener('mouseenter', handleEnter);
            el.removeEventListener('mouseleave', handleLeave);
        };
    }, [items]);

    if (items.length === 0) return null;

    const doubled = [...items, ...items];

    return (
        <div className="rounded-lg border border-border bg-bg-card px-3 py-2.5">
            <div className="flex items-center gap-2">
                <div className="flex shrink-0 items-center gap-1 text-danger">
                    <Flame className="h-3.5 w-3.5" />
                    <span className="text-xs font-semibold">快讯</span>
                </div>
                <div className="h-3 w-px bg-border" />
                <div ref={scrollRef} className="flex-1 overflow-hidden whitespace-nowrap scrollbar-none">
                    <div className="inline-flex gap-8">
                        {doubled.map((item, i) => (
                            <span
                                key={`${item.id}-${i}`}
                                className="inline-block text-xs text-text-secondary transition-colors hover:text-text-primary"
                            >
                                {item.title}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
