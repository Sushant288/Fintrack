export const queryKeys = {
  users: {
    me: () => ['users', 'me'] as const
  },
  categories: {
    all: () => ['categories'] as const,
    list: (filters: { type?: string; includeArchived?: boolean; q?: string } = {}) =>
      ['categories', 'list', filters] as const
  }
} as const;
