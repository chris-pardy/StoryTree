import "./HandleSearch.css";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { handleSearchQuery, type SearchedActor } from "#/queries/handle-search";
import { resolveProfileActor } from "#/server/identity/profile-actor";

function looksLikeHandle(input: string): boolean {
	return /\./.test(input.trim()) && !/\s/.test(input.trim());
}

function useDebounced<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return debounced;
}

export function HandleSearch({
	onSelect,
	placeholder = "Search handles or display names",
	autoFocus = false,
}: {
	onSelect: (actor: SearchedActor) => void;
	placeholder?: string;
	autoFocus?: boolean;
}) {
	const inputId = useId();
	const [term, setTerm] = useState("");
	const debounced = useDebounced(term, 180);
	const inputRef = useRef<HTMLInputElement>(null);

	const { data: actors = [], isFetching } = useQuery(
		handleSearchQuery(debounced),
	);

	const resolveMutation = useMutation({
		mutationFn: async (handle: string) => {
			const actor = await resolveProfileActor({ data: { param: handle } });
			return actor;
		},
	});

	const trimmed = debounced.trim();
	const showFallback =
		trimmed.length > 0 &&
		!isFetching &&
		actors.length === 0 &&
		looksLikeHandle(trimmed);

	async function tryResolveFallback() {
		const result = await resolveMutation.mutateAsync(trimmed);
		if (result) {
			onSelect({
				did: result.did,
				handle: result.handle,
				displayName: result.displayName ?? undefined,
			});
			setTerm("");
		}
	}

	return (
		<div className="handle-search">
			<label className="handle-search-label" htmlFor={inputId}>
				Recipient
			</label>
			<input
				id={inputId}
				ref={inputRef}
				type="search"
				autoComplete="off"
				autoCapitalize="off"
				spellCheck={false}
				// biome-ignore lint/a11y/noAutofocus: opt-in via prop; caller decides.
				autoFocus={autoFocus}
				value={term}
				onChange={(e) => setTerm(e.target.value)}
				placeholder={placeholder}
				className="handle-search-input"
			/>
			<ul className="handle-search-results" aria-label="Matches">
				{actors.map((actor) => (
					<li key={actor.did}>
						<button
							type="button"
							className="handle-search-result"
							onClick={() => {
								onSelect(actor);
								setTerm("");
							}}
						>
							{actor.avatar ? (
								<img
									src={actor.avatar}
									alt=""
									className="handle-search-avatar"
									loading="lazy"
								/>
							) : (
								<span className="handle-search-avatar is-placeholder" />
							)}
							<span className="handle-search-meta">
								<span className="handle-search-display">
									{actor.displayName || `@${actor.handle}`}
								</span>
								{actor.displayName && (
									<span className="handle-search-handle">@{actor.handle}</span>
								)}
							</span>
						</button>
					</li>
				))}
				{showFallback && (
					<li>
						<button
							type="button"
							className="handle-search-result is-fallback"
							onClick={() => void tryResolveFallback()}
							disabled={resolveMutation.isPending}
						>
							<span className="handle-search-avatar is-placeholder" />
							<span className="handle-search-meta">
								<span className="handle-search-display">
									{resolveMutation.isPending
										? `Resolving @${trimmed}…`
										: resolveMutation.isError
											? `Couldn’t resolve @${trimmed}`
											: `Resolve @${trimmed}`}
								</span>
								<span className="handle-search-handle">
									Not in Bluesky — try direct lookup
								</span>
							</span>
						</button>
					</li>
				)}
				{trimmed.length > 0 &&
					!isFetching &&
					actors.length === 0 &&
					!showFallback && <li className="handle-search-empty">No matches</li>}
			</ul>
		</div>
	);
}
