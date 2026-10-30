/** Source of truth for every string of the console; other locales must have exactly this shape. */
export const en = {
  app: {
    name: 'Ostrom',
    mocks: 'Demo data: this console is not connected to an Ostrom server.',
    skipToContent: 'Skip to content',
    nav: { label: 'Main', home: 'Home' },
    theme: {
      switch: 'Theme: {{current}}. Switch to {{next}}',
      names: { system: 'system', light: 'light', dark: 'dark' },
    },
    notFound: { title: 'Nothing here', body: 'This page does not exist.', home: 'Back to the console' },
    error: {
      title: 'Something broke',
      body: 'This screen failed to load. The rest of Ostrom keeps working.',
    },
  },
  home: {
    title: 'Every agent change, approved by the right person.',
    lead: 'The Ostrom console is being rebuilt. Screens arrive one by one.',
  },
} as const;
