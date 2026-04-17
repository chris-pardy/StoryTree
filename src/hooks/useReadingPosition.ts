import { useEffect } from "react";

const VISIBLE_CLASS = "story-visible";
const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

function storageKey(rootUri: string) {
	return `ink.branchline.readingPosition-${rootUri}`;
}

function isReading(entry: IntersectionObserverEntry): boolean {
	if (entry.intersectionRatio >= 0.99) return true;
	if (
		entry.rootBounds != null &&
		entry.intersectionRect.height >= entry.rootBounds.height * 0.9
	)
		return true;
	return false;
}

function getSavedPath(key: string): string[] | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const path: unknown = JSON.parse(raw);
		if (!Array.isArray(path) || !path.length) return null;
		return path as string[];
	} catch {
		return null;
	}
}

/**
 * Tracks reading position for a branch, persisting it to localStorage.
 * On mount, restores scroll to the last-read bud.
 * While reading, saves the path from root to the furthest-read bud.
 * Clears saved position when the masthead is fully visible.
 */
export function useReadingPosition(
	mastheadRef: React.RefObject<HTMLDivElement | null>,
	listRef: React.RefObject<HTMLOListElement | null>,
	rootUri: string,
	budUris: string[],
) {
	const key = storageKey(rootUri);

	// restore scroll position on mount
	// biome-ignore lint/correctness/useExhaustiveDependencies: listRef.current is a mutable ref; re-runs should fire on key/budUris change, not ref mutation.
	useEffect(() => {
		const ol = listRef.current;
		if (!ol) return;

		const savedPath = getSavedPath(key);
		if (!savedPath) return;

		const budSet = new Set(budUris);
		let targetUri: string | null = null;
		for (let i = savedPath.length - 1; i >= 0; i--) {
			if (budSet.has(savedPath[i])) {
				targetUri = savedPath[i];
				break;
			}
		}
		if (!targetUri) return;

		const target = ol.querySelector<HTMLElement>(
			`li[data-bud-uri="${CSS.escape(targetUri)}"]`,
		);
		if (!target) return;

		const items = ol.querySelectorAll<HTMLElement>("li[data-bud-uri]");
		for (const item of items) {
			item.classList.add(VISIBLE_CLASS);
			if (item === target) break;
		}
		target.scrollIntoView({ behavior: "instant", block: "center" });
	}, [key, budUris]);

	// track reading position, entrance animations, and masthead clear
	// biome-ignore lint/correctness/useExhaustiveDependencies: listRef/mastheadRef are mutable refs; re-runs should fire on key/budUris change, not ref mutation.
	useEffect(() => {
		const ol = listRef.current;
		const masthead = mastheadRef.current;
		if (!ol) return;
		const items = ol.querySelectorAll<HTMLElement>("li[data-bud-uri]");
		if (!items.length) return;

		const active = new Set<string>();
		let mastheadFullyVisible = false;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const el = entry.target as HTMLElement;

					if (el === masthead) {
						mastheadFullyVisible = entry.intersectionRatio >= 0.99;
						continue;
					}

					const budUri = el.dataset.budUri;
					if (!budUri) continue;
					if (entry.isIntersecting) {
						el.classList.add(VISIBLE_CLASS);
						if (isReading(entry)) active.add(budUri);
					} else {
						active.delete(budUri);
					}
				}

				if (mastheadFullyVisible) {
					try {
						localStorage.removeItem(key);
					} catch {}
					return;
				}

				for (let i = items.length - 1; i >= 0; i--) {
					const budUri = items[i].dataset.budUri;
					if (budUri && active.has(budUri)) {
						const path = budUris.slice(0, budUris.indexOf(budUri) + 1);
						try {
							localStorage.setItem(key, JSON.stringify(path));
						} catch {}
						break;
					}
				}
			},
			{ threshold: THRESHOLDS },
		);

		if (masthead) observer.observe(masthead);
		for (const item of items) observer.observe(item);
		return () => observer.disconnect();
	}, [key, budUris]);
}
