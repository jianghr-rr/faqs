import {type NextRequest, NextResponse} from 'next/server';
import {i18nRouter} from 'next-i18n-router';
import {decrypt} from '~/lib/auth/session';
import i18nConfig from './i18nConfig';

const protectedRoutes = ['/personal-center'];

export async function proxy(request: NextRequest) {
    const response = i18nRouter(request, i18nConfig);
    const {pathname} = request.nextUrl;

    const pathnameWithoutLocale = pathname.replace(/^\/(zh|en)(?=\/|$)/, '') || '/';
    const isProtectedRoute = protectedRoutes.some((route) =>
        pathnameWithoutLocale.startsWith(route)
    );

    const cookie = request.cookies.get('Authentication')?.value;
    const session = await decrypt(cookie);

    if (isProtectedRoute && !session?.userId) {
        const locale = pathname.match(/^\/(zh|en)(?=\/|$)/)?.[1] ?? 'zh';
        return NextResponse.redirect(new URL(`/${locale}`, request.url));
    }

    return response;
}

export const config = {
    matcher: '/((?!api|static|.*\\..*|_next).*)',
};
