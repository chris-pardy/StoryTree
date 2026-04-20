import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { loadOgFonts } from "./fonts";

const WIDTH = 1200;
const HEIGHT = 630;

const INK = "#173a40";
const INK_SOFT = "#416166";
const LAGOON_DEEP = "#328f97";
const SAND = "#e7f0e8";
const FOAM = "#f3faf5";

export type OgCard = {
	title: string;
	authorDisplayName: string | null;
	authorHandle: string;
	childCount: number;
	pollenCount: number;
};

function authorLabel(card: OgCard): string {
	const display = card.authorDisplayName?.trim();
	const handle = card.authorHandle;
	if (display && display.length > 0) return `${display} · @${handle}`;
	return `@${handle}`;
}

// Satori's -webkit-line-clamp is unreliable on nested flex containers, so we
// enforce line caps via character budgets + explicit maxHeight clipping. The
// budget is tuned for Fraunces 500 @88px over the 1040px text column left
// after horizontal padding.
function clamp(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1).trimEnd()}…`;
}
const TITLE_MAX = 90;
const TITLE_FONT_SIZE = 80;
const TITLE_LINE_HEIGHT_RATIO = 1.15;
const TITLE_LINES = 3;
// Line-height boxes don't cover descenders — Fraunces at 144pt opsz has a
// deep descender metric, so pad the clipping maxHeight by ~15% of the font
// size on top of `lineHeight * lines` to keep glyphs like `p`, `g`, `j`
// from getting their tails sheared off by `overflow: hidden`.
const DESCENDER_PAD = 0.15;
const TITLE_MAX_HEIGHT =
	TITLE_FONT_SIZE * (TITLE_LINE_HEIGHT_RATIO * TITLE_LINES + DESCENDER_PAD);

// Lucide `sprout` (v0.577) — mirrors BranchLink.tsx. Inlined so satori can
// rasterize the icon without pulling React components.
function SproutIcon() {
	return (
		<svg
			width="22"
			height="22"
			viewBox="0 0 24 24"
			fill="none"
			stroke={INK_SOFT}
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M7 20h10" />
			<path d="M10 20c5.5-2.5.8-6.4 3-10" />
			<path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
			<path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
		</svg>
	);
}

// Lucide `sparkles` (v0.577) — mirrors PollenButton.tsx.
function SparklesIcon() {
	return (
		<svg
			width="22"
			height="22"
			viewBox="0 0 24 24"
			fill="none"
			stroke={INK_SOFT}
			strokeWidth={1.6}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
			<path d="M20 3v4" />
			<path d="M22 5h-4" />
			<path d="M4 17v2" />
			<path d="M5 18H3" />
		</svg>
	);
}

function StatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "8px 18px",
				borderRadius: 999,
				border: `1px solid ${LAGOON_DEEP}33`,
				backgroundColor: "rgba(255,255,255,0.72)",
				fontSize: 22,
				fontWeight: 600,
				color: INK_SOFT,
			}}
		>
			{icon}
			<span style={{ display: "flex" }}>{label}</span>
		</div>
	);
}

export type ProfileOgCard = {
	displayName: string | null;
	handle: string;
	bloomCount: number;
	plantingCount: number;
};

const PROFILE_NAME_MAX = 60;

function rasterize(svg: string): Buffer {
	const resvg = new Resvg(svg, {
		fitTo: { mode: "width", value: WIDTH },
		background: FOAM,
	});
	return Buffer.from(resvg.render().asPng());
}

function shellStyle(): React.CSSProperties {
	return {
		width: WIDTH,
		height: HEIGHT,
		display: "flex",
		flexDirection: "column",
		backgroundColor: FOAM,
		backgroundImage: `radial-gradient(900px 480px at 50% -12%, rgba(79,184,178,0.36), transparent 70%), linear-gradient(180deg, ${SAND} 0%, ${FOAM} 58%, #e7f3ec 100%)`,
		padding: "64px 80px",
		fontFamily: "Manrope",
		color: INK,
	};
}

function Wordmark({ align }: { align: "flex-start" | "flex-end" }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: align,
				fontSize: 20,
				fontWeight: 700,
				letterSpacing: 6,
				textTransform: "uppercase",
				color: LAGOON_DEEP,
			}}
		>
			<span style={{ display: "flex" }}>branchline.ink</span>
		</div>
	);
}

export async function renderSiteOgPng(): Promise<Buffer> {
	const fonts = await loadOgFonts();
	const svg = await satori(
		<div style={shellStyle()}>
			<Wordmark align="flex-end" />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					marginTop: 44,
					flex: 1,
					minHeight: 0,
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						fontFamily: "Fraunces",
						fontWeight: 500,
						fontSize: 124,
						lineHeight: 1.05,
						letterSpacing: -2,
						color: INK,
					}}
				>
					<span style={{ display: "flex" }}>Stories grow</span>
					<span
						style={{
							display: "flex",
							fontFamily: "Fraunces",
							fontWeight: 400,
							fontStyle: "italic",
							color: LAGOON_DEEP,
						}}
					>
						in branches.
					</span>
				</div>
				<div
					style={{
						display: "flex",
						marginTop: 28,
						fontSize: 30,
						fontWeight: 400,
						color: INK_SOFT,
					}}
				>
					Read a branch, grow a bud, watch stories bloom.
				</div>
			</div>
		</div>,
		{ width: WIDTH, height: HEIGHT, fonts },
	);
	return rasterize(svg);
}

export async function renderProfileOgPng(card: ProfileOgCard): Promise<Buffer> {
	const fonts = await loadOgFonts();
	const display = card.displayName?.trim() || `@${card.handle}`;
	const subtitle = card.displayName?.trim() ? `@${card.handle}` : null;
	const svg = await satori(
		<div style={shellStyle()}>
			<Wordmark align="flex-end" />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					marginTop: 44,
					flex: 1,
					minHeight: 0,
					overflow: "hidden",
				}}
			>
				<div
					style={{
						display: "flex",
						fontSize: 24,
						fontWeight: 700,
						letterSpacing: 4,
						textTransform: "uppercase",
						color: LAGOON_DEEP,
					}}
				>
					<span style={{ display: "flex" }}>Profile</span>
				</div>
				<div
					style={{
						display: "flex",
						marginTop: 18,
						fontFamily: "Fraunces",
						fontWeight: 500,
						fontSize: 96,
						lineHeight: 1.1,
						letterSpacing: -1.4,
						color: INK,
						maxHeight: 96 * 1.1 * 2 + 96 * DESCENDER_PAD,
						overflow: "hidden",
					}}
				>
					{clamp(display, PROFILE_NAME_MAX)}
				</div>
				{subtitle && (
					<div
						style={{
							display: "flex",
							marginTop: 20,
							fontSize: 30,
							fontWeight: 400,
							color: INK_SOFT,
						}}
					>
						{subtitle}
					</div>
				)}
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 14,
					marginTop: 28,
				}}
			>
				<StatChip
					icon={<SproutIcon />}
					label={`${card.bloomCount} ${card.bloomCount === 1 ? "bloom" : "blooms"}`}
				/>
				<StatChip
					icon={<SparklesIcon />}
					label={`${card.plantingCount} ${card.plantingCount === 1 ? "planting" : "plantings"}`}
				/>
			</div>
		</div>,
		{ width: WIDTH, height: HEIGHT, fonts },
	);
	return rasterize(svg);
}

export async function renderBudOgPng(card: OgCard): Promise<Buffer> {
	const fonts = await loadOgFonts();

	const svg = await satori(
		<div style={shellStyle()}>
			<Wordmark align="flex-end" />

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					marginTop: 44,
					flex: 1,
					minHeight: 0,
					overflow: "hidden",
				}}
			>
				<div
					style={{
						display: "flex",
						fontFamily: "Fraunces",
						fontWeight: 500,
						fontSize: TITLE_FONT_SIZE,
						lineHeight: TITLE_LINE_HEIGHT_RATIO,
						letterSpacing: -1.2,
						color: INK,
						maxHeight: TITLE_MAX_HEIGHT,
						overflow: "hidden",
					}}
				>
					{clamp(card.title, TITLE_MAX)}
				</div>

				<div
					style={{
						display: "flex",
						marginTop: 28,
						fontSize: 28,
						fontWeight: 400,
						color: INK_SOFT,
					}}
				>
					by {authorLabel(card)}
				</div>
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 14,
					marginTop: 28,
				}}
			>
				<StatChip
					icon={<SproutIcon />}
					label={`${card.childCount} ${card.childCount === 1 ? "branch" : "branches"}`}
				/>
				<StatChip
					icon={<SparklesIcon />}
					label={`${card.pollenCount} ${card.pollenCount === 1 ? "pollen" : "pollen"}`}
				/>
			</div>
		</div>,
		{ width: WIDTH, height: HEIGHT, fonts },
	);

	return rasterize(svg);
}
