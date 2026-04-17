import { useEffect, useRef } from "react";

export function LoadMoreSentinel({
	onLoadMore,
	rootMargin = "400px",
}: {
	onLoadMore: () => void;
	rootMargin?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) onLoadMore();
			},
			{ rootMargin },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [onLoadMore, rootMargin]);

	return <div ref={ref} aria-hidden="true" />;
}
