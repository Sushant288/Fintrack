export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  CATEGORIES: '/categories',
  SETTINGS: '/settings'
} as const;

export const KNOWN_ROUTES = Object.values(ROUTES);

export function isKnownRoute(path: string): boolean {
  const pathname = path.split('?')[0].split('#')[0];
  return KNOWN_ROUTES.includes(pathname as (typeof KNOWN_ROUTES)[number]);
}
