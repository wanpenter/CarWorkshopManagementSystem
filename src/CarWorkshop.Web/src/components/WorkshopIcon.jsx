const paths = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  customers: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5" /></>,
  vehicles: <><path d="m5 7 2-3h10l2 3 2 4v7H3v-7l2-4Zm-1 4h16M6 18v3m12-3v3M7 14h1m8 0h1" /></>,
  appointments: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3m-10 3h3" /></>,
  services: <><path d="M14 4a6 6 0 0 0-7 8L3 16a3 3 0 0 0 5 5l5-5a6 6 0 0 0 7-8l-4 4-4-4 4-4Z" /></>,
  mechanics: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2M9 15l3 4 3-4" /></>,
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="currentColor" /><circle cx="15" cy="17" r="3" fill="currentColor" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />
};

export default function WorkshopIcon({ name, className = "" }) {
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.dashboard}</svg>;
}
