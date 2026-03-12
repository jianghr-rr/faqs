import {NextResponse} from 'next/server';
import {UnauthorizedError} from '~/lib/auth/require-user';

export function unauthorizedResponse(message = 'Login required') {
    return NextResponse.json(
        {
            error: {
                code: 'UNAUTHORIZED',
                message,
            },
        },
        {status: 401}
    );
}

export function serviceUnavailableResponse(message = '服务暂时不可用，请稍后重试') {
    return NextResponse.json(
        {
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message,
            },
        },
        {status: 503}
    );
}

export function invalidInputResponse(message: string) {
    return NextResponse.json(
        {
            error: {
                code: 'INVALID_INPUT',
                message,
            },
        },
        {status: 400}
    );
}

export function notFoundResponse(message: string) {
    return NextResponse.json(
        {
            error: {
                code: 'NOT_FOUND',
                message,
            },
        },
        {status: 404}
    );
}

export function analysisFailedResponse(message = 'Unable to finish research workflow') {
    return NextResponse.json(
        {
            error: {
                code: 'ANALYSIS_FAILED',
                message,
            },
        },
        {status: 500}
    );
}

export function handleRouteError(error: unknown) {
    if (error instanceof UnauthorizedError) {
        return unauthorizedResponse(error.message);
    }

    if (error instanceof Error && error.message === 'AUTH_SERVICE_UNAVAILABLE') {
        console.error('[api] auth service unavailable:', error.cause ?? error);
        return serviceUnavailableResponse('登录状态校验超时，请稍后重试');
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error('[api] request failed:', message);
    return analysisFailedResponse();
}
