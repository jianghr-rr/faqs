/**
 * Seed local admin accounts into Supabase Auth + public.profiles.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-admin-accounts.mjs
 */

import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import process from 'node:process';
import {createClient} from '@supabase/supabase-js';

const cwdEnvPath = resolve(process.cwd(), '.env.local');
const rootEnvPath = resolve(process.cwd(), '../../.env.local');

function loadEnvFile(filePath) {
    if (!existsSync(filePath)) return;

    const content = readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const equalIndex = line.indexOf('=');
        if (equalIndex === -1) continue;

        const key = line.slice(0, equalIndex).trim();
        const value = line.slice(equalIndex + 1).trim().replace(/^['"]|['"]$/g, '');

        if (!(key in process.env)) {
            process.env[key] = value;
        }
    }
}

loadEnvFile(rootEnvPath);
loadEnvFile(cwdEnvPath);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const localConfigPath = resolve(process.cwd(), 'scripts/admin-accounts.local.json');

const missing = [];
if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!existsSync(localConfigPath)) missing.push('scripts/admin-accounts.local.json');

if (missing.length > 0) {
    globalThis.console.error(`Missing required config: ${missing.join(', ')}`);
    globalThis.console.error(`Checked local account file at: ${localConfigPath}`);
    globalThis.console.error(`Checked env files at: ${cwdEnvPath} and ${rootEnvPath}`);
    process.exit(1);
}

function loadLocalAdminAccounts() {
    const raw = readFileSync(localConfigPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('scripts/admin-accounts.local.json must be a non-empty array');
    }

    return parsed.map((item, index) => {
        if (!item?.id || !item?.name || !item?.email || !item?.password) {
            throw new Error(`Invalid admin account at index ${index}`);
        }

        return {
            id: item.id,
            name: item.name,
            email: item.email,
            password: item.password,
            role: 'admin',
        };
    });
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function main() {
    const accounts = loadLocalAdminAccounts();
    const {data, error} = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
    });

    if (error) throw error;

    const existingUsers = data.users ?? [];

    for (const account of accounts) {
        const existingUser = existingUsers.find((user) => user.email === account.email);

        let userId = existingUser?.id;

        if (existingUser) {
            const {error: updateError} = await supabase.auth.admin.updateUserById(existingUser.id, {
                email: account.email,
                password: account.password,
                email_confirm: true,
                user_metadata: {
                    name: account.name,
                },
            });

            if (updateError) throw updateError;

            globalThis.console.log(`[seed:admin-accounts] updated auth user ${account.email}`);
        } else {
            const {data: created, error: createError} = await supabase.auth.admin.createUser({
                email: account.email,
                password: account.password,
                email_confirm: true,
                user_metadata: {
                    name: account.name,
                },
            });

            if (createError) throw createError;

            userId = created.user.id;
            globalThis.console.log(`[seed:admin-accounts] created auth user ${account.email}`);
        }

        if (!userId) {
            throw new Error(`Missing user id for ${account.email}`);
        }

        const {error: profileError} = await supabase.from('profiles').upsert(
            {
                id: userId,
                name: account.name,
                role: account.role,
            },
            {
                onConflict: 'id',
            }
        );

        if (profileError) throw profileError;

        globalThis.console.log(`[seed:admin-accounts] upserted profile ${account.email} (${account.role})`);
    }

    globalThis.console.log('[seed:admin-accounts] done');
}

main().catch((error) => {
    globalThis.console.error('[seed:admin-accounts] failed:', error);
    process.exit(1);
});
