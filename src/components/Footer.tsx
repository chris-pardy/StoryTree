import { Link } from "@tanstack/react-router";

export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer className="site-colophon">
			<div className="site-colophon-inner">
				<Link to="/">branchline</Link>
				<span className="site-colophon-dot" aria-hidden="true" />
				<p>vol. i</p>
				<span className="site-colophon-dot" aria-hidden="true" />
				<p>set in fraunces &amp; manrope</p>
				<span className="site-colophon-dot" aria-hidden="true" />
				<p>{year}</p>
				<span className="site-colophon-dot" aria-hidden="true" />
				<Link to="/policy">policy</Link>
			</div>
		</footer>
	);
}
