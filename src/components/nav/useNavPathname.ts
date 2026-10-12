'use client';

import { usePathname } from 'next/navigation';
import { normalizeNavPathname } from './navPathname';

/**
 * usePathname() for anything that renders navigation state.
 *
 * Every nav component reads the route through this hook and none calls
 * usePathname() itself: the raw value differs between Vercel's server render of
 * the home page and the browser (see normalizeNavPathname), and one component
 * comparing the raw value is enough to fail hydration for the whole page.
 */
export function useNavPathname(): string {
    return normalizeNavPathname(usePathname());
}
