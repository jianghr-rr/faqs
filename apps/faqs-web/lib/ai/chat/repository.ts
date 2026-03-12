import {and, asc, eq} from 'drizzle-orm';
import {db} from '~/db';
import {researchChatMessages, researchChatSessions} from '~/db/schema';
import type {ChatHistoryTurn} from '~/lib/ai/prompts/research';

type PersistedChatTurn = {
    role: 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
};

function toSessionTitle(message: string) {
    return message.trim().replace(/\s+/g, ' ').slice(0, 60);
}

function toPreview(message: string) {
    return message.trim().replace(/\s+/g, ' ').slice(0, 120);
}

async function getSessionById(sessionId: string) {
    const [session] = await db.select().from(researchChatSessions).where(eq(researchChatSessions.id, sessionId)).limit(1);
    return session ?? null;
}

export async function getPersistedChatHistory(sessionId: string): Promise<ChatHistoryTurn[]> {
    const rows = await db
        .select({
            role: researchChatMessages.role,
            content: researchChatMessages.content,
        })
        .from(researchChatMessages)
        .where(eq(researchChatMessages.sessionId, sessionId))
        .orderBy(asc(researchChatMessages.createdAt));

    return rows.map((row) => ({
        role: row.role,
        content: row.content,
    }));
}

export async function appendPersistedChatTurns(input: {
    sessionId: string;
    userId?: string | null;
    turns: PersistedChatTurn[];
}) {
    const normalizedTurns = input.turns
        .map((turn) => ({
            role: turn.role,
            content: turn.content.trim(),
            metadata: turn.metadata ?? {},
        }))
        .filter((turn) => turn.content.length > 0);

    if (normalizedTurns.length === 0) {
        return;
    }

    const existingSession = await getSessionById(input.sessionId);
    const firstUserTurn = normalizedTurns.find((turn) => turn.role === 'user');
    const lastTurn = normalizedTurns.at(-1);

    if (!existingSession) {
        await db.insert(researchChatSessions).values({
            id: input.sessionId,
            userId: input.userId ?? null,
            title: firstUserTurn ? toSessionTitle(firstUserTurn.content) : null,
            lastMessagePreview: lastTurn ? toPreview(lastTurn.content) : null,
        });
    } else {
        const updates: {
            userId?: string | null;
            title?: string | null;
            lastMessagePreview?: string | null;
        } = {
            lastMessagePreview: lastTurn ? toPreview(lastTurn.content) : existingSession.lastMessagePreview,
        };

        if (!existingSession.userId && input.userId) {
            updates.userId = input.userId;
        }

        if (!existingSession.title && firstUserTurn) {
            updates.title = toSessionTitle(firstUserTurn.content);
        }

        await db
            .update(researchChatSessions)
            .set(updates)
            .where(eq(researchChatSessions.id, input.sessionId));
    }

    await db.insert(researchChatMessages).values(
        normalizedTurns.map((turn) => ({
            sessionId: input.sessionId,
            role: turn.role,
            content: turn.content,
            metadata: turn.metadata,
        }))
    );
}

export async function isChatSessionOwnedByUser(sessionId: string, userId: string) {
    const [session] = await db
        .select({id: researchChatSessions.id})
        .from(researchChatSessions)
        .where(and(eq(researchChatSessions.id, sessionId), eq(researchChatSessions.userId, userId)))
        .limit(1);

    return Boolean(session);
}
