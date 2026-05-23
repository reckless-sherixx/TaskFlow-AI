export function redact(text?: string | null): string | undefined {
	if (!text) return text === null ? undefined : text;

	let redacted = text;

	// 1. Credit Cards (13-16 digits)
	redacted = redacted.replace(/\b(?:\d[ -]*?){13,16}\b/g, "<CARD>");

	// 2. Aadhaar (12 digits format: XXXX XXXX XXXX or XXXXXXXXXXXX)
	redacted = redacted.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "<AADHAAR>");

	// 3. PAN Card (5 letters, 4 numbers, 1 letter)
	redacted = redacted.replace(/\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/gi, "<PAN>");

	// 4. Emails
	redacted = redacted.replace(
		/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi,
		"<EMAIL>",
	);

	// 5. Phone numbers (10+ digits with optional +, spaces, hyphens, parens)
	redacted = redacted.replace(
		/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
		"<PHONE>",
	);

	return redacted;
}
