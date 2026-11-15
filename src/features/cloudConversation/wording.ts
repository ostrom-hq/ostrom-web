// SPDX-License-Identifier: Apache-2.0
import { registerWording } from '@/shared/i18n/i18n';

/** What a conversation session's screen says (TeamCode's companion transcript): loaded with its screen alone. */
export const cloudConversationEn = {
  cloudConversation: {
    back: 'Cloud agents',
    notConversation: 'This session runs in a terminal: it has no conversation to show here.',
    unsupported: 'This server does not serve conversations.',
    gone: 'This session does not exist, or you may no longer read it.',
    transcript: 'Conversation',
    empty: 'Nothing yet: the agent’s messages and actions appear here as it works.',
    live: {
      connecting: 'Connecting…',
      live: 'Live',
      reconnecting: 'Reconnecting…',
      ended: 'Ended',
      stopped: 'Not following',
    },
    retry: 'Try again',
    denied: 'You may no longer read this session.',
    running: 'The agent is working…',
    writing: 'The agent is writing',
    waiting: {
      permission: 'The agent waits for permission to use a tool.',
      question: 'The agent asks you a question.',
      other: 'The agent waits for you.',
    },
    from: 'From another member',
    actions_one: '{{count}} action',
    actions_other: '{{count}} actions',
    input: 'Input',
    output: 'Output',
    error: 'Error',
    exitCode: 'Exit code {{code}}',
    turn: {
      completed: 'Turn completed',
      interrupted: 'Turn interrupted',
      failed: 'Turn failed',
    },
    seconds: '{{count}} s',
    steps_one: '{{count}} step',
    steps_other: '{{count}} steps',
    system: {
      agentStarted: 'Agent started',
      agentExited: 'The agent exited with code {{code}}',
      error: 'Error: {{message}}',
      inputRejected: 'A message was not delivered ({{reason}})',
      inputCancelled: 'A message was cancelled ({{reason}})',
      aTool: 'a tool',
      permission: 'The agent waits for permission to use {{tool}}',
      question: 'The agent asks a question',
      permissionExpired: 'A permission request expired and was denied',
      transferred: 'The session changed owner',
      truncated: 'An event too large to show ({{type}})',
    },
    composer: {
      label: 'Message the agent',
      send: 'Send',
      ended: 'This session ended: it takes no more messages.',
      invalid: 'Write a message of up to 32,000 characters, without control characters.',
    },
    interrupt: 'Interrupt',
    interrupting: 'Interrupting…',
    nothingRunning: 'Nothing is running.',
    pending: {
      sending: 'Sending…',
      sent: 'Sent, waiting for the agent',
      woke: 'Sent, the session is waking up',
      failed: 'Not sent: {{reason}}',
      refused: 'Refused: {{reason}}',
      unknown: 'no reason given',
      retry: 'Retry',
      discard: 'Discard',
    },
  },
} as const;

const cloudConversationFr = {
  cloudConversation: {
    back: 'Agents cloud',
    notConversation: 'Cette session tourne dans un terminal : elle n’a pas de conversation à montrer ici.',
    unsupported: 'Ce serveur ne sert pas les conversations.',
    gone: 'Cette session n’existe pas, ou vous ne pouvez plus la lire.',
    transcript: 'Conversation',
    empty:
      'Rien pour l’instant : les messages et les actions de l’agent s’affichent ici à mesure qu’il travaille.',
    live: {
      connecting: 'Connexion…',
      live: 'En direct',
      reconnecting: 'Reconnexion…',
      ended: 'Terminée',
      stopped: 'Non suivie',
    },
    retry: 'Réessayer',
    denied: 'Vous ne pouvez plus lire cette session.',
    running: 'L’agent travaille…',
    writing: 'L’agent écrit',
    waiting: {
      permission: 'L’agent attend l’autorisation d’utiliser un outil.',
      question: 'L’agent vous pose une question.',
      other: 'L’agent vous attend.',
    },
    from: 'D’un autre membre',
    actions_one: '{{count}} action',
    actions_other: '{{count}} actions',
    input: 'Entrée',
    output: 'Sortie',
    error: 'Erreur',
    exitCode: 'Code de sortie {{code}}',
    turn: {
      completed: 'Tour terminé',
      interrupted: 'Tour interrompu',
      failed: 'Tour en échec',
    },
    seconds: '{{count}} s',
    steps_one: '{{count}} étape',
    steps_other: '{{count}} étapes',
    system: {
      agentStarted: 'Agent démarré',
      agentExited: 'L’agent s’est arrêté avec le code {{code}}',
      error: 'Erreur : {{message}}',
      inputRejected: 'Un message n’a pas été remis ({{reason}})',
      inputCancelled: 'Un message a été annulé ({{reason}})',
      aTool: 'un outil',
      permission: 'L’agent attend l’autorisation d’utiliser {{tool}}',
      question: 'L’agent pose une question',
      permissionExpired: 'Une demande d’autorisation a expiré et a été refusée',
      transferred: 'La session a changé de propriétaire',
      truncated: 'Un événement trop volumineux pour être affiché ({{type}})',
    },
    composer: {
      label: 'Écrire à l’agent',
      send: 'Envoyer',
      ended: 'Cette session est terminée : elle n’accepte plus de messages.',
      invalid: 'Écrivez un message de 32 000 caractères au plus, sans caractère de contrôle.',
    },
    interrupt: 'Interrompre',
    interrupting: 'Interruption…',
    nothingRunning: 'Rien n’est en cours.',
    pending: {
      sending: 'Envoi…',
      sent: 'Envoyé, en attente de l’agent',
      woke: 'Envoyé, la session se réveille',
      failed: 'Non envoyé : {{reason}}',
      refused: 'Refusé : {{reason}}',
      unknown: 'sans raison donnée',
      retry: 'Réessayer',
      discard: 'Abandonner',
    },
  },
};

declare module '@/shared/i18n/types' {
  interface FeatureWording {
    readonly cloudConversation: CloudConversationWording['cloudConversation'];
  }
}
type CloudConversationWording = typeof cloudConversationEn;

registerWording({ en: cloudConversationEn, fr: cloudConversationFr });
