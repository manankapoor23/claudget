import { useEffect } from 'react';

/** Resolves the theme setting (following the OS for 'system') onto <html data-theme>. */
export function useTheme(theme: 'system' | 'dark' | 'light' | undefined): void {
  useEffect(() => {
    const effective = theme ?? 'system';
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      const resolved = effective === 'system' ? (mq.matches ? 'dark' : 'light') : effective;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (effective !== 'system') return undefined;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}
