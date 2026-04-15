type LogoMarkProps = {
	className?: string;
	title?: string;
};

export default function LogoMark({
	className,
	title = "Storytree",
}: LogoMarkProps) {
	return (
		<span
			role="img"
			aria-label={title}
			className={`logo-mark${className ? ` ${className}` : ""}`}
		/>
	);
}
