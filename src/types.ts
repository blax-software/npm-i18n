/**
 * Marker for a translation that still needs writing. Put it where the real
 * text will go instead of an empty string or copied English, so an IDE's
 * "find references" and `blax-i18n check` both locate every open translation.
 *
 * @example
 * export default {
 *   en: { greeting: 'Hello' },
 *   de: { greeting: 'Hallo' },
 *   pl: { greeting: TranslationMissing },
 * } satisfies TranslationFile
 */
export const TranslationMissing = '[missing]' as const

export type TranslationMissingType = typeof TranslationMissing

/** One locale's message tree (nested objects, string leaves — arrays allowed for vue-i18n lists). */
export type Messages = Record<string, any>

/**
 * A per-page source module: one object keyed by locale code, each holding that
 * page's messages for that locale. `i18n/pages/*.ts` default-export this shape.
 */
export type TranslationFile = { [locale: string]: Messages }

/** The merged result: locale code → complete message tree. */
export type LocaleMessages = Record<string, Messages>
