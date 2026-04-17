// Google Fonts' CSS API varies font format and coverage by User-Agent. This
// Safari 5/Mac UA is the sweet spot: it returns direct .ttf URLs (which
// satori/opentype.js can parse) and includes every requested weight in one
// response. Any other UA tested either returns WOFF2 (unsupported), EOT, or
// drops weights.
const TTF_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_0) AppleWebKit/533.17.8 (KHTML, like Gecko) Version/5.0.1 Safari/533.17.8";

type FontWeight = 400 | 500 | 700;

type LoadedFont = {
	name: string;
	data: ArrayBuffer;
	weight: FontWeight;
	style: "normal" | "italic";
};

type FaceSpec = {
	family: "Manrope" | "Fraunces";
	weight: FontWeight;
};

async function fetchFaces(
	cssUrl: string,
	specs: FaceSpec[],
): Promise<LoadedFont[]> {
	const css = await fetch(cssUrl, {
		headers: { "User-Agent": TTF_UA },
	}).then((r) => r.text());

	const faces = new Map<number, string>();
	const faceRe = /@font-face\s*{([^}]+)}/g;
	for (const m of css.matchAll(faceRe)) {
		const body = m[1];
		const weightMatch = body.match(/font-weight:\s*(\d+)/);
		const urlMatch = body.match(
			/src:\s*url\((https:\/\/[^)]+\.ttf)\)\s*format\('truetype'\)/,
		);
		if (!weightMatch || !urlMatch) continue;
		faces.set(Number.parseInt(weightMatch[1], 10), urlMatch[1]);
	}

	return Promise.all(
		specs.map(async (spec) => {
			const url = faces.get(spec.weight);
			if (!url) {
				throw new Error(
					`og fonts: no TTF URL for ${spec.family} ${spec.weight} in ${cssUrl}`,
				);
			}
			const data = await fetch(url).then((r) => r.arrayBuffer());
			return { name: spec.family, data, weight: spec.weight, style: "normal" };
		}),
	);
}

let cached: Promise<LoadedFont[]> | null = null;

async function loadOnce(): Promise<LoadedFont[]> {
	const [manrope, fraunces] = await Promise.all([
		fetchFaces(
			"https://fonts.googleapis.com/css2?family=Manrope:wght@400;700",
			[
				{ family: "Manrope", weight: 400 },
				{ family: "Manrope", weight: 700 },
			],
		),
		// Match BloomCard's on-site Fraunces weights: 400 for the preview body,
		// 500 for the title (BloomCard.css:46).
		fetchFaces(
			"https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500",
			[
				{ family: "Fraunces", weight: 400 },
				{ family: "Fraunces", weight: 500 },
			],
		),
	]);
	return [...manrope, ...fraunces];
}

export function loadOgFonts(): Promise<LoadedFont[]> {
	if (cached) return cached;
	const pending = loadOnce();
	cached = pending;
	pending.catch(() => {
		if (cached === pending) cached = null;
	});
	return pending;
}
