// SPDX-License-Identifier: Apache-2.0
import { registerWording } from '@/shared/i18n/i18n';

/** What the Discord section of My notifications says: loaded with the notifications' chunk, not with every screen. */
export const discordEn = {
  discord: {
    title: 'Discord',
    lead: 'Your notifications and the requests for your yes, as direct messages in Discord.',
    invite:
      'Link your Discord account by signing in to Discord: it must be a member of this server’s Discord server, whose bot writes to you. You never type a Discord id.',
    link: 'Link my Discord account',
    linking: 'Opening Discord…',
    linkedTag: 'Linked',
    linked:
      'Your Discord account {{name}} receives your notifications. A request for your yes has a Reject button, and Approve opens it here.',
    linkedUnnamed:
      'Your Discord account receives your notifications. A request for your yes has a Reject button, and Approve opens it here.',
    unlink: 'Unlink',
    notConfigured:
      'Discord is not set up on this server. An administrator sets the Discord application in Admin, Settings (section discord).',
    errorTag: 'Not linked',
    doneTag: 'Linked',
    done: 'Your Discord account is linked.',
    unsafe: 'The server named an address that is not Discord’s secure page: nothing was opened.',
    refusal: {
      notConfigured:
        'Discord is not set up on this server. An administrator sets the Discord application first.',
      taken: 'Another member of this organization already linked this Discord account.',
      notInGuild:
        'Join this server’s Discord server first, then link again: its bot only writes to its members.',
      notFound: 'This link has expired or was already used. Link again.',
      otherBrowser: 'Finish the link in the browser that started it. Link again from here.',
      denied: 'Discord did not authorize the link.',
      unreachable: 'Discord does not answer. Try again in a moment.',
      failed: 'The link did not go through. Try again.',
    },
  },
} as const;

declare module '@/shared/i18n/types' {
  interface FeatureWording {
    readonly discord: DiscordWording['discord'];
  }
}
type DiscordWording = typeof discordEn;

registerWording({
  en: discordEn,
  fr: {
    discord: {
      title: 'Discord',
      lead: 'Vos notifications et les demandes de oui, en messages privés dans Discord.',
      invite:
        'Liez votre compte Discord en vous connectant à Discord : il doit être membre du serveur Discord de cette instance, dont le bot vous écrit. Vous ne tapez jamais d’identifiant Discord.',
      link: 'Lier mon compte Discord',
      linking: 'Ouverture de Discord…',
      linkedTag: 'Lié',
      linked:
        'Votre compte Discord {{name}} reçoit vos notifications. Une demande de oui a un bouton Refuser, et Approuver l’ouvre ici.',
      linkedUnnamed:
        'Votre compte Discord reçoit vos notifications. Une demande de oui a un bouton Refuser, et Approuver l’ouvre ici.',
      unlink: 'Délier',
      notConfigured:
        'Discord n’est pas configuré sur ce serveur. Un administrateur règle l’application Discord dans Admin, Réglages (section discord).',
      errorTag: 'Non lié',
      doneTag: 'Lié',
      done: 'Votre compte Discord est lié.',
      unsafe:
        'Le serveur a donné une adresse qui n’est pas la page sécurisée de Discord : rien n’a été ouvert.',
      refusal: {
        notConfigured:
          'Discord n’est pas configuré sur ce serveur. Un administrateur règle d’abord l’application Discord.',
        taken: 'Un autre membre de cette organisation a déjà lié ce compte Discord.',
        notInGuild:
          'Rejoignez d’abord le serveur Discord de cette instance, puis liez à nouveau : son bot n’écrit qu’à ses membres.',
        notFound: 'Ce lien a expiré ou a déjà servi. Liez à nouveau.',
        otherBrowser: 'Terminez le lien dans le navigateur qui l’a commencé. Liez à nouveau depuis ici.',
        denied: 'Discord n’a pas autorisé le lien.',
        unreachable: 'Discord ne répond pas. Réessayez dans un instant.',
        failed: 'Le lien n’a pas abouti. Réessayez.',
      },
    },
  },
});
