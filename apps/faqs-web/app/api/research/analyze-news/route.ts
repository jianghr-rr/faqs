import {NextResponse, type NextRequest} from 'next/server';
import {handleRouteError, invalidInputResponse, notFoundResponse} from '~/lib/api/errors';
import {analyzeNewsById} from '~/lib/research/service';
import type {ResearchTraceStep} from '~/lib/kg/types';

type StreamEvent =
    | {type: 'trace_start'; data: {mode: 'news_analysis'; startedAt: string}}
    | {type: 'trace_step'; data: ResearchTraceStep}
    | {type: 'final'; data: Record<string, unknown>}
    | {type: 'error'; error: {code: string; message: string}};

function toNdjsonLine(event: StreamEvent) {
    return `${JSON.stringify(event)}\n`;
}

function isStreamClosedError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }
    return (
        error.name === 'ResponseAborted' ||
        error.message.includes('ResponseAborted') ||
        error.message.includes('WritableStream is closed') ||
        error.message.includes('ERR_INVALID_STATE')
    );
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {newsId?: string; forceReanalyze?: boolean; stream?: boolean};
        if (!body.newsId) {
            return invalidInputResponse('newsId is required');
        }

        if (typeof body.forceReanalyze !== 'undefined' && typeof body.forceReanalyze !== 'boolean') {
            return invalidInputResponse('forceReanalyze must be a boolean');
        }

        if (body.stream !== true) {
            const result = await analyzeNewsById(body.newsId, {forceReanalyze: body.forceReanalyze === true});
            return NextResponse.json(result);
        }

        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        const encoder = new TextEncoder();
        let streamClosed = false;

        void (async () => {
            const write = async (event: StreamEvent) => {
                if (streamClosed) {
                    return false;
                }
                try {
                    await writer.write(encoder.encode(toNdjsonLine(event)));
                    return true;
                } catch (error) {
                    if (!isStreamClosedError(error)) {
                        console.error('[api/research/analyze-news] stream write failed:', error);
                    }
                    streamClosed = true;
                    return false;
                }
            };

            try {
                await write({
                    type: 'trace_start',
                    data: {
                        mode: 'news_analysis',
                        startedAt: new Date().toISOString(),
                    },
                });

                const result = await analyzeNewsById(body.newsId!, {
                    forceReanalyze: body.forceReanalyze === true,
                    onTraceStep: async (step) => {
                        await write({
                            type: 'trace_step',
                            data: step,
                        });
                    },
                });

                await write({
                    type: 'final',
                    data: result,
                });
            } catch (error) {
                if (streamClosed) {
                    return;
                }
                if (error instanceof Error && error.message === 'NEWS_NOT_FOUND') {
                    await write({
                        type: 'error',
                        error: {
                            code: 'NOT_FOUND',
                            message: 'News not found',
                        },
                    });
                } else {
                    await write({
                        type: 'error',
                        error: {
                            code: 'ANALYSIS_FAILED',
                            message: error instanceof Error ? error.message : 'Unable to finish research workflow',
                        },
                    });
                }
            } finally {
                if (!streamClosed) {
                    try {
                        await writer.close();
                    } catch (error) {
                        if (!isStreamClosedError(error)) {
                            console.error('[api/research/analyze-news] stream close failed:', error);
                        }
                    }
                }
            }
        })();

        return new NextResponse(stream.readable, {
            headers: {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
            },
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'NEWS_NOT_FOUND') {
            return notFoundResponse('News not found');
        }

        return handleRouteError(error);
    }
}
