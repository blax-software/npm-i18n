import { TranslationMissing, type TranslationFile } from '@blax-software/i18n'
import { shared } from './_shared'

export default {
  en: { cart: { title: 'Your cart', empty: 'Nothing here yet', brand: shared.brand }, nav: { cart: 'Cart' } },
  de: { cart: { title: 'Dein Warenkorb', empty: 'Noch nichts drin', brand: shared.brand }, nav: { cart: 'Warenkorb' } },
  pl: { cart: { title: 'Twój koszyk', empty: TranslationMissing, brand: shared.brand }, nav: { cart: 'Koszyk' } },
} satisfies TranslationFile
