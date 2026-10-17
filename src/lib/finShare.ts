import { plural } from './format'

export interface FinShareInput {
  juste: number
  n: number
  /** Jours de révision de suite, séance comprise. */
  streak: number
  /** Adresse du site, pour inviter (pas de lien profond : aucun identifiant). */
  url: string
}

/** Bilan d'une séance « Je réponds » à partager (WhatsApp…) : score, série, invitation. Ni e-mail ni pseudo. */
export function finShareText({ juste, n, streak, url }: FinShareInput): string {
  const serie = streak > 1 ? ` 🔥 ${streak} jours de suite` : ''
  return `J’ai répondu juste à ${plural(juste, 'question', 'questions')} sur ${n} sur Xam Xam Bëy${serie}.\nRévise avec moi : ${url}`
}
