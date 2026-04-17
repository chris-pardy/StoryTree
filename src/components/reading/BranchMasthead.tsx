import { useSuspenseQueries } from "@tanstack/react-query";
import { AuthorLink } from "#/components/AuthorLink";
import { budQuery } from "#/queries/buds";

export function BranchMasthead({
	rootUri,
	leafUri,
}: {
	rootUri: string;
	leafUri: string;
}) {
	const [{ data: rootBud }, { data: leafBud }] = useSuspenseQueries({
		queries: [budQuery(rootUri), budQuery(leafUri)],
	});

	const rootTitle = rootBud.title;
	const leafTitle = leafBud.title;
	const showPair =
		rootUri !== leafUri &&
		Boolean(rootTitle && leafTitle) &&
		rootTitle !== leafTitle;

	return (
		<header className="reading-masthead rise-in">
			<h1 className="masthead-title">
				{showPair ? (
					<>
						{rootTitle}
						<br />
						<em>and {leafTitle}</em>
					</>
				) : (
					(leafTitle ?? rootTitle ?? "\u00A0")
				)}
			</h1>
			<p className="masthead-byline">
				By{" "}
				<AuthorLink
					did={leafBud.author.did}
					handle={leafBud.author.handle}
					displayName={leafBud.author.displayName}
					className="masthead-handle"
				/>
				{(() => {
					const sameAuthor = rootBud.author.did === leafBud.author.did;
					const exclude = sameAuthor ? 1 : 2;
					const others = Math.max(
						0,
						(leafBud.intermediateCount ?? 0) - exclude,
					);
					if (others === 0 && sameAuthor) return null;
					if (others === 0) {
						return (
							<>
								{", "}
								<AuthorLink
									did={rootBud.author.did}
									handle={rootBud.author.handle}
									displayName={rootBud.author.displayName}
									className="masthead-handle"
								/>
							</>
						);
					}
					return (
						<>
							{!sameAuthor && (
								<>
									{", "}
									<AuthorLink
										did={rootBud.author.did}
										handle={rootBud.author.handle}
										displayName={rootBud.author.displayName}
										className="masthead-handle"
									/>
								</>
							)}
							{others > 0 && (
								<>
									{!sameAuthor ? ", " : " "}and {others}{" "}
									{others === 1 ? "other" : "others"}
								</>
							)}
						</>
					);
				})()}
			</p>
		</header>
	);
}
