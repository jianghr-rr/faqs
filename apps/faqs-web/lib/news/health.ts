const WINDOW_MS = 5 * 60 * 1000;
const FAILURE_THRESHOLD = 0.05;
const COOLDOWN_MS = 10 * 60 * 1000;

interface AdapterRecord {
    successes: number[];
    failures: number[];
    disabledUntil: number;
}

const registry = new Map<string, AdapterRecord>();

function getRecord(name: string): AdapterRecord {
    let record = registry.get(name);
    if (!record) {
        record = {successes: [], failures: [], disabledUntil: 0};
        registry.set(name, record);
    }
    return record;
}

function pruneOld(timestamps: number[], now: number): number[] {
    const cutoff = now - WINDOW_MS;
    return timestamps.filter((t) => t >= cutoff);
}

export function recordSuccess(adapterName: string) {
    const now = Date.now();
    const record = getRecord(adapterName);
    record.successes = [...pruneOld(record.successes, now), now];
}

export function recordFailure(adapterName: string) {
    const now = Date.now();
    const record = getRecord(adapterName);
    record.failures = [...pruneOld(record.failures, now), now];

    const total = record.successes.length + record.failures.length;
    if (total >= 3) {
        const failureRate = record.failures.length / total;
        if (failureRate >= FAILURE_THRESHOLD) {
            record.disabledUntil = now + COOLDOWN_MS;
            console.warn(
                `[news/health] adapter "${adapterName}" disabled for ${COOLDOWN_MS / 60000}min ` +
                    `(failure rate: ${(failureRate * 100).toFixed(1)}%, ${record.failures.length}/${total})`
            );
        }
    }
}

export function isAdapterHealthy(adapterName: string): boolean {
    const record = registry.get(adapterName);
    if (!record) return true;
    if (record.disabledUntil > Date.now()) return false;

    if (record.disabledUntil > 0 && record.disabledUntil <= Date.now()) {
        record.disabledUntil = 0;
        record.successes = [];
        record.failures = [];
    }

    return true;
}

export function getHealthStatus() {
    const now = Date.now();
    const result: Record<string, {healthy: boolean; failureRate: number; disabledUntil: number | null}> = {};

    for (const [name, record] of registry) {
        const successes = pruneOld(record.successes, now);
        const failures = pruneOld(record.failures, now);
        const total = successes.length + failures.length;

        result[name] = {
            healthy: isAdapterHealthy(name),
            failureRate: total > 0 ? failures.length / total : 0,
            disabledUntil: record.disabledUntil > now ? record.disabledUntil : null,
        };
    }

    return result;
}
