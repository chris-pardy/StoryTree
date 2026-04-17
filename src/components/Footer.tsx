import "./Footer.css";
import { Link } from "@tanstack/react-router";

export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer className="site-colophon">
			<div className="site-colophon-inner">
				<Link to="/">branchline</Link>
				<span
					className="site-colophon-dot colophon-detail"
					aria-hidden="true"
				/>
				<p className="colophon-detail">vol. i</p>
				<span
					className="site-colophon-dot colophon-detail"
					aria-hidden="true"
				/>
				<p className="colophon-detail">set in fraunces &amp; manrope</p>
				<span
					className="site-colophon-dot colophon-detail"
					aria-hidden="true"
				/>
				<p className="colophon-detail">{year}</p>
				<span className="site-colophon-dot" aria-hidden="true" />
				<Link to="/policy">policy</Link>
				<span className="site-colophon-dot" aria-hidden="true" />
				<a
					className="site-colophon-social"
					href="https://bsky.app/profile/branchline.ink"
					target="_blank"
					rel="noreferrer"
					aria-label="branchline on Bluesky (@branchline.ink)"
				>
					<svg
						viewBox="0 0 600 530"
						xmlns="http://www.w3.org/2000/svg"
						aria-hidden="true"
						focusable="false"
					>
						<path
							fill="currentColor"
							d="M135.7 44.2C202.6 94.4 274.6 195.9 301 250.4c26.4-54.5 98.4-156 165.3-206.2C514.6 7.9 592.8-20.2 592.8 69c0 17.8-10.2 149.5-16.2 170.9-20.8 74.3-96.6 93.3-164 81.8 117.8 20 147.8 86.4 83.1 152.8-122.9 126-176.6-31.6-190.4-72C303 396.6 301.1 390.7 301 395.7c-.1-5-2 .9-4.3 7.8-13.8 40.4-67.5 198-190.4 72-64.7-66.4-34.7-132.8 83.1-152.8-67.4 11.5-143.2-7.5-164-81.8C19.4 219.5 9.2 87.8 9.2 70 9.2-19.2 87.4 8.9 135.7 44.2z"
						/>
					</svg>
					<span>@branchline.ink</span>
				</a>
			</div>
		</footer>
	);
}
