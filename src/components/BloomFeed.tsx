import "./BloomFeed.css";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BudCard } from "#/components/BudCard";
import { bloomsQuery } from "#/queries/blooms";

export function BloomFeed({
	sort = "pollen",
	limit = 20,
}: {
	sort?: string;
	limit?: number;
}) {
	const { data: blooms } = useSuspenseQuery(bloomsQuery(sort, limit));

	if (blooms.length === 0) {
		return <p className="bloom-feed-empty">No blooms yet. Check back later.</p>;
	}

	return (
		<ul className="bloom-grid">
			{blooms.map((bloom) => (
				<li key={bloom.bloom}>
					<BudCard uri={bloom.bloom} rootUri={bloom.root} />
				</li>
			))}
		</ul>
	);
}
