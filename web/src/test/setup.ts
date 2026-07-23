import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

Object.defineProperty(window, 'location', {
  configurable: true,
  writable: true,
  value: {
    origin: 'http://localhost',
    href: 'http://localhost/marketing/reports',
    pathname: '/marketing/reports',
    search: '',
  },
});
