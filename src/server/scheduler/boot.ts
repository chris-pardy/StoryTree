import { prisma } from "../../db.ts";
import { postDailyStatsToCentralBsky } from "./daily-post.ts";
import { collectDailyStats } from "./stats.ts";

declare global {
	// eslint-disable-next-line no-var
	var __dailySchedulerStop: (() => Promise<void>) | undefined;
}

const TZ = "America/New_York";
const FIRE_HOUR_LOCAL = 11;
const FIRE_MINUTE_LOCAL = 0;
const WINDOW_MS = 24 * 60 * 60 * 1000;

type TzParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
};

function readTzParts(date: Date, timeZone: string): TzParts {
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const parts: Record<string, string> = {};
	for (const p of fmt.formatToParts(date)) {
		if (p.type !== "literal") parts[p.type] = p.value;
	}
	return {
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		hour: Number(parts.hour),
		minute: Number(parts.minute),
		second: Number(parts.second),
	};
}

// Returns the next UTC instant that renders as `hour:minute:00` in `timeZone`,
// strictly after `now`. The approach is: pick the ET calendar date of the next
// candidate fire, then iteratively correct for DST offset by rendering the
// guess back in ET and subtracting the difference. Two passes are enough even
// across spring-forward, since each pass reduces the error by a DST hour.
export function nextFireAt(
	now: Date,
	opts: {
		timeZone: string;
		hour: number;
		minute: number;
	},
): Date {
	const et = readTzParts(now, opts.timeZone);
	const pastFire =
		et.hour > opts.hour ||
		(et.hour === opts.hour &&
			(et.minute > opts.minute ||
				(et.minute === opts.minute && et.second > 0)));

	// Advance one ET calendar day when today's fire has already passed. We roll
	// via Date.UTC to pick up month/year rollover without re-implementing it.
	const base = pastFire
		? new Date(Date.UTC(et.year, et.month - 1, et.day + 1))
		: new Date(Date.UTC(et.year, et.month - 1, et.day));
	const targetY = base.getUTCFullYear();
	const targetM = base.getUTCMonth() + 1;
	const targetD = base.getUTCDate();

	// First guess assumes EST (UTC-5); the correction loop fixes EDT automatically.
	let guess = new Date(
		Date.UTC(targetY, targetM - 1, targetD, opts.hour + 5, opts.minute, 0),
	);
	for (let i = 0; i < 3; i++) {
		const g = readTzParts(guess, opts.timeZone);
		const currentUtc = Date.UTC(
			g.year,
			g.month - 1,
			g.day,
			g.hour,
			g.minute,
			g.second,
		);
		const wantedUtc = Date.UTC(
			targetY,
			targetM - 1,
			targetD,
			opts.hour,
			opts.minute,
			0,
		);
		const delta = wantedUtc - currentUtc;
		if (delta === 0) break;
		guess = new Date(guess.getTime() + delta);
	}
	return guess;
}

async function runTick(scheduledFor: Date): Promise<void> {
	// The tick represents stats for the 24h window ending at the scheduled fire
	// time, not wall-clock now — that keeps the windows aligned across retries
	// and matches what users expect ("the 11 AM update covers 11→11").
	const end = scheduledFor;
	const start = new Date(end.getTime() - WINDOW_MS);
	try {
		const stats = await collectDailyStats({ prisma }, { start, end });
		await postDailyStatsToCentralBsky(stats);
		console.log(
			`[scheduler] posted daily stats for ${start.toISOString()}..${end.toISOString()}`,
			stats,
		);
	} catch (err) {
		console.error("[scheduler] tick failed", err);
	}
}

// Starts a daily timer that fires at `FIRE_HOUR_LOCAL:FIRE_MINUTE_LOCAL` in
// `TZ`. Safe to call many times — only the first call installs a timer.
export function bootDailyScheduler(): void {
	if (process.env.SCHEDULER_ENABLED !== "true") return;
	// On Fly, every machine runs the same command and inherits SCHEDULER_ENABLED.
	// Gate on FLY_PROCESS_GROUP so only the "scheduler" machine runs the cron.
	// Off-Fly (dev), FLY_PROCESS_GROUP is unset so the scheduler boots normally.
	const flyGroup = process.env.FLY_PROCESS_GROUP;
	if (flyGroup && flyGroup !== "scheduler") return;
	if (globalThis.__dailySchedulerStop) return;

	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	const schedule = () => {
		if (stopped) return;
		const fireAt = nextFireAt(new Date(), {
			timeZone: TZ,
			hour: FIRE_HOUR_LOCAL,
			minute: FIRE_MINUTE_LOCAL,
		});
		const delay = Math.max(1_000, fireAt.getTime() - Date.now());
		console.log(
			`[scheduler] next daily post at ${fireAt.toISOString()} (in ${Math.round(delay / 1000)}s)`,
		);
		timer = setTimeout(async () => {
			await runTick(fireAt);
			schedule();
		}, delay);
	};

	schedule();

	globalThis.__dailySchedulerStop = async () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
	console.log(
		`[scheduler] booted daily stats scheduler (${FIRE_HOUR_LOCAL}:${String(FIRE_MINUTE_LOCAL).padStart(2, "0")} ${TZ})`,
	);
}

export async function stopDailyScheduler(): Promise<void> {
	const stop = globalThis.__dailySchedulerStop;
	if (!stop) return;
	globalThis.__dailySchedulerStop = undefined;
	await stop();
}
