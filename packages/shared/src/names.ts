/** Comparison key for names: "raymond", "Raymond " and "RAYMOND" are one name (KAN-61, KAN-62). */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;
const INVISIBLE_KEEPING_JOINERS = /\p{Cc}|(?![‌‍])\p{Cf}/gu;

export const normalizeName = (name: string) => name.replace(INVISIBLE, "").normalize("NFC").trim().toLocaleLowerCase("en-US");

export const visibleName = (name: string) => name.replace(INVISIBLE_KEEPING_JOINERS, "");

/**
 * `normalizeName` without the trim, for comparing a stored (already trimmed) name with a slice of
 * text the same length: trimming the slice would let "José " match a name stored decomposed.
 */
export const foldName = (name: string) => name.normalize("NFC").toLocaleLowerCase("en-US");
