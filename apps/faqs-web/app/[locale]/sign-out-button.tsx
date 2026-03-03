'use client';

import {LogOut} from 'lucide-react';
import {signOut} from '~/actions/auth';

export function SignOutButton() {
    return (
        <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-danger transition-colors hover:bg-bg-hover active:bg-bg-hover"
        >
            <LogOut className="h-5 w-5" />
            退出登录
        </button>
    );
}
