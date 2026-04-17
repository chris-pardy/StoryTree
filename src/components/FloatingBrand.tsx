import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import LogoMark from "./LogoMark";
import "./FloatingBrand.css";

export default function FloatingBrand() {
	const [visible, setVisible] = useState(false);
	const queryClient = useQueryClient();

	useEffect(() => {
		const header = document.querySelector(".site-masthead");
		if (!header) return;
		const observer = new IntersectionObserver(
			([entry]) => setVisible(!entry.isIntersecting),
			{ threshold: 0 },
		);
		observer.observe(header);
		return () => observer.disconnect();
	}, []);

	const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
		if (window.location.pathname === "/") {
			event.preventDefault();
			window.scrollTo(0, 0);
			queryClient.invalidateQueries({ queryKey: ["blooms"] });
		}
	};

	return (
		<Link
			to="/"
			className={`floating-brand${visible ? " is-visible" : ""}`}
			aria-label="Back to branchline"
			aria-hidden={!visible}
			tabIndex={visible ? 0 : -1}
			onClick={handleClick}
		>
			<LogoMark title="Branchline" />
			<span className="floating-brand-label">branchline</span>
		</Link>
	);
}
