import "./BloomCarousel.css";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BudView } from "#/generated/lexicons/types/ink/branchline/getBuds";
import { budQuery } from "#/queries/buds";
import { BloomCard } from "./BloomCard";

export function BloomCarousel({
	rootUri,
	budUri,
}: {
	rootUri: string;
	budUri: string;
}) {
	const { data: parentBloom } = useSuspenseQuery<BudView>(budQuery(budUri));
	const trackRef = useRef<HTMLUListElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const updateScrollState = useCallback(() => {
		const el = trackRef.current;
		if (!el) return;
		setCanScrollLeft(el.scrollLeft > 1);
		setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
	}, []);

	useEffect(() => {
		const el = trackRef.current;
		if (!el) return;
		updateScrollState();
		el.addEventListener("scroll", updateScrollState, { passive: true });
		const resizeObserver = new ResizeObserver(updateScrollState);
		resizeObserver.observe(el);
		for (const child of Array.from(el.children)) {
			resizeObserver.observe(child);
		}
		const mutationObserver = new MutationObserver(() => {
			for (const child of Array.from(el.children)) {
				resizeObserver.observe(child);
			}
			updateScrollState();
		});
		mutationObserver.observe(el, { childList: true });
		return () => {
			el.removeEventListener("scroll", updateScrollState);
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	}, [updateScrollState]);

	const scrollBy = (direction: 1 | -1) => {
		const el = trackRef.current;
		if (!el) return;
		el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
	};

	if (
		!parentBloom ||
		!parentBloom.children ||
		parentBloom.children.length === 0
	)
		return null;

	return (
		<section className="bloom-carousel">
			<button
				type="button"
				className="bloom-carousel-nav bloom-carousel-nav-prev"
				aria-label="Scroll left"
				onClick={() => scrollBy(-1)}
				disabled={!canScrollLeft}
				hidden={!canScrollLeft && !canScrollRight}
			>
				<ChevronLeft size={18} strokeWidth={1.8} aria-hidden="true" />
			</button>
			<ul ref={trackRef} className="bloom-carousel-track">
				{parentBloom.children.map((child) => (
					<li key={child}>
						<BloomCard uri={child} rootUri={rootUri} />
					</li>
				))}
			</ul>
			<button
				type="button"
				className="bloom-carousel-nav bloom-carousel-nav-next"
				aria-label="Scroll right"
				onClick={() => scrollBy(1)}
				disabled={!canScrollRight}
				hidden={!canScrollLeft && !canScrollRight}
			>
				<ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" />
			</button>
		</section>
	);
}
