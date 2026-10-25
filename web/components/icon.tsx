const paths = {
  leaf: 'M20 4C10 2 3 7 5 14c2 6 12 6 15-10ZM5 20 16 9M10 15v-5',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z',
  catalog: 'M4 3h6v7H4zM14 3h6v7h-6zM4 14h6v7H4zM14 14h6v7h-6z',
  book: 'M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  external: 'M14 3h7v7m0-7L10 14M9 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0ZM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  water: 'M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z',
  chart: 'M3 3v18h18M7 15l5-6 4 3 5-8',
  info: 'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  lock: 'M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4zM12 15v3',
  fish: 'M3 12c5-7 12-7 17 0-5 7-12 7-17 0Zm0 0L1 7v10Zm13-2v.1',
  animal: 'M7 8 3 4v7l3 2v5l6 3 6-3v-5l3-2V4l-4 4M9 14h.1M15 14h.1M10 18h4',
  chevronDown: 'M6 9l6 6 6-6',
  sun: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M18 6L6 18M6 6l12 12',
} as const;
export type IconName = keyof typeof paths;
export function Icon({name, size = 20, className = ''}: {name: IconName; size?: number; className?: string}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}><path d={paths[name]}/></svg>;
}
