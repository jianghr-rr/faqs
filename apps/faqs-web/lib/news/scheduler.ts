/**
 * A股交易时段感知调度逻辑。
 * 配合外部 cron（如 Vercel Cron 每分钟触发）使用：
 * cron 调用 /api/news/cron → shouldFetchNow() 判断是否该执行采集。
 */

type TradingSession = 'market_open' | 'pre_post' | 'night' | 'event';

interface ScheduleResult {
    shouldFetch: boolean;
    session: TradingSession;
    intervalMinutes: number;
    reason: string;
}

function getBeijingHourMinute(): {hour: number; minute: number; dayOfWeek: number} {
    const now = new Date();
    const beijing = new Date(now.toLocaleString('en-US', {timeZone: 'Asia/Shanghai'}));
    return {
        hour: beijing.getHours(),
        minute: beijing.getMinutes(),
        dayOfWeek: beijing.getDay(),
    };
}

function detectSession(hour: number, minute: number, dayOfWeek: number): TradingSession {
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const timeInMinutes = hour * 60 + minute;

    if (!isWeekday) return 'night';

    // A股盘中: 9:30-11:30, 13:00-15:00
    const morningOpen = 9 * 60 + 30;
    const morningClose = 11 * 60 + 30;
    const afternoonOpen = 13 * 60;
    const afternoonClose = 15 * 60;

    if (
        (timeInMinutes >= morningOpen && timeInMinutes <= morningClose) ||
        (timeInMinutes >= afternoonOpen && timeInMinutes <= afternoonClose)
    ) {
        return 'market_open';
    }

    // 盘前/盘后: 8:00-9:30, 15:00-18:00
    const preMarket = 8 * 60;
    const postMarket = 18 * 60;
    if (
        (timeInMinutes >= preMarket && timeInMinutes < morningOpen) ||
        (timeInMinutes > afternoonClose && timeInMinutes <= postMarket)
    ) {
        return 'pre_post';
    }

    return 'night';
}

const SESSION_INTERVALS: Record<TradingSession, number> = {
    market_open: 2,
    pre_post: 5,
    night: 15,
    event: 1,
};

let lastFetchTime = 0;

export function shouldFetchNow(): ScheduleResult {
    const {hour, minute, dayOfWeek} = getBeijingHourMinute();
    const session = detectSession(hour, minute, dayOfWeek);
    const intervalMinutes = SESSION_INTERVALS[session];

    const now = Date.now();
    const elapsed = (now - lastFetchTime) / 60_000;

    if (elapsed < intervalMinutes) {
        return {
            shouldFetch: false,
            session,
            intervalMinutes,
            reason: `Last fetch ${Math.round(elapsed)}m ago, interval is ${intervalMinutes}m`,
        };
    }

    return {
        shouldFetch: true,
        session,
        intervalMinutes,
        reason: `Session: ${session}, interval: ${intervalMinutes}m`,
    };
}

export function markFetched() {
    lastFetchTime = Date.now();
}

export function getScheduleInfo() {
    const {hour, minute, dayOfWeek} = getBeijingHourMinute();
    const session = detectSession(hour, minute, dayOfWeek);
    return {
        session,
        intervalMinutes: SESSION_INTERVALS[session],
        beijingTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        dayOfWeek,
    };
}
