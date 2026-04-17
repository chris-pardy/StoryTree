import { useSuspenseQuery } from "@tanstack/react-query";
import { authorSeedsQuery } from "#/queries/author-seeds";
import { SeedCard } from "./SeedCard";

export function AuthorSeedsList({
	did,
	emptyLabel = "Nothing ready to plant yet.",
}: {
	did: string;
	emptyLabel?: string;
}) {
	const { data: seeds } = useSuspenseQuery(authorSeedsQuery(did));

	if (seeds.length === 0) {
		return <p className="bloom-feed-empty">{emptyLabel}</p>;
	}

	return (
		<ul className="bloom-grid">
			{seeds.map((uri) => (
				<li key={uri}>
					<SeedCard uri={uri} />
				</li>
			))}
		</ul>
	);
}
