import {type NextRequest, NextResponse} from 'next/server';
import {i18nRouter} from 'next-i18n-router';
import {updateSession} from '~/lib/supabase/proxy';
import i18nConfig from './i18nConfig';

const protectedRoutes = ['/analysis', '/my-faqs', '/settings'];

export async function proxy(request: NextRequest) {
    const i18nResponse = i18nRouter(request, i18nConfig);

    const {user, response} = await updateSession(request, i18nResponse);

    const {pathname} = request.nextUrl;
    const pathnameWithoutLocale = pathname.replace(/^\/(zh|en)(?=\/|$)/, '') || '/';
    const isProtectedRoute = protectedRoutes.some((route) =>
        pathnameWithoutLocale.startsWith(route)
    );

    if (isProtectedRoute && !user) {
        const locale = pathname.match(/^\/(zh|en)(?=\/|$)/)?.[1] ?? 'zh';
        const callbackUrl = encodeURIComponent(pathnameWithoutLocale);
        return NextResponse.redirect(new URL(`/${locale}/login?next=${callbackUrl}`, request.url));
    }

    return response;
}

export const config = {
    matcher: '/((?!api|auth|static|.*\\..*|_next).*)',
};
