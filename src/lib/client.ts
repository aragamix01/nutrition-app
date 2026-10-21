'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * A value computed only in the browser (e.g. today's Bangkok date). Pages are prerendered at build time,
 * so anything clock- or locale-dependent would otherwise freeze at build time or mismatch on hydration.
 */
export const useClientValue = <T>(get: () => T, server: T): T =>
  useSyncExternalStore(noop, get, () => server);
