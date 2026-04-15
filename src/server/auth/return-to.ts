// Guards user-supplied post-login redirect targets against open-redirect
// abuse. Same-origin relative paths only: must start with a single `/` and
// must not be a protocol-relative `//host` URL. Also rejects control
// characters so the value can't smuggle an extra HTTP header when written
// straight into `Location`.
export function isSafeReturnTo(value: string): boolean {
	if (typeof value !== "string" || value.length === 0) return false;
	if (value.length > 1024) return false;
	if (!value.startsWith("/")) return false;
	if (value.startsWith("//")) return false;
	if (value.startsWith("/\\")) return false;
	if (/[\r\n\0]/.test(value)) return false;
	return true;
}
