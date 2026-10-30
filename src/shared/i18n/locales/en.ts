/** Source of truth for every string of the console; other locales must have exactly this shape. */
export const en = {
  app: {
    name: 'Ostrom',
    skipToContent: 'Skip to content',
    nav: { label: 'Main', home: 'Home' },
    theme: { toLight: 'Switch to light theme', toDark: 'Switch to dark theme' },
  },
  home: {
    title: 'Every agent change, approved by the right person.',
    lead: 'The Ostrom console is being rebuilt. Screens arrive one by one.',
  },
} as const;
