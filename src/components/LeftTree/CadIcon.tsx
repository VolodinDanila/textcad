import type { ReactNode } from 'react'

const drawings = {
    document: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/></>,
    folder: <path d="M3 7V5h6l2 2h10v13H3V7h18"/>,
    sketch: <><path d="M14 4H4v16h16V10M7 16l1-4L17 3l4 4-9 9-5 1"/><path d="m15 5 4 4"/></>,
    body: <><path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/></>,
    link: <><path d="M6 4v8a4 4 0 0 0 4 4h10m-4-4 4 4-4 4"/></>,
    extrude: <><path d="m4 12 8-4 8 4-8 4zM4 12v6l8 4 8-4v-6M12 16v6M12 8V2m-3 3 3-3 3 3"/></>,
    revolve: <><path d="M12 3v18M5 6c-4 2-4 10 0 12m14 0c4-2 4-10 0-12M16 4l3 2-3 2"/><path d="M8 7h4v10H8z"/></>,
    union: <><path d="M3 3h11v6h7v12H9v-7H3z"/><path d="M14 9v5H9" strokeDasharray="2 2"/></>,
    cut: <><path d="M3 3h12v6H9v6H3zM12 12h9v9h-9z"/><path d="M14 16h5"/></>,
    intersect: <><path d="M3 3h12v12H3zM9 9h12v12H9z"/><path d="M9 9h6v6H9z" fill="currentColor" fillOpacity=".2"/></>,
    loft: <><ellipse cx="12" cy="5" rx="5" ry="2"/><ellipse cx="12" cy="19" rx="9" ry="3"/><path d="M7 5 3 19M17 5l4 14"/></>,
    fillet: <><path d="M4 3v12a5 5 0 0 0 5 5h12M8 3v10a3 3 0 0 0 3 3h10"/></>,
    chamfer: <><path d="M4 3v11l6 6h11M8 3v10l3 3h10"/></>,
    shell: <><path d="m3 7 9-4 9 4v12l-9 3-9-3zM3 7l9 4 9-4M12 11v11"/><path d="m7 7 5-2 5 2-5 2z"/></>,
    translate: <><path d="M3 3h8v8H3zM13 13h8v8h-8zM9 15l6-6m-4 0h4v4"/></>,
    rotate: <><path d="M5 8a8 8 0 1 1-1 9M2 4v5h5"/><path d="m11 9 6 3-3 6-6-3z"/></>,
    mirror: <><path d="M12 2v20M3 7l6 5-6 5zM21 7l-6 5 6 5z"/></>,
    scale: <><path d="M3 12v9h9M3 3h18v18h-9M8 16 17 7m-6 0h6v6"/></>,
    'pattern-linear': <><rect x="2" y="9" width="5" height="7" rx="1"/><rect x="10" y="9" width="5" height="7" rx="1"/><rect x="18" y="9" width="4" height="7" rx="1"/><path d="M3 5h18"/></>,
    'pattern-circular': <><circle cx="12" cy="12" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="12" cy="20" r="2"/><circle cx="4" cy="12" r="2"/></>,
    hole: <><ellipse cx="12" cy="8" rx="8" ry="4"/><ellipse cx="12" cy="8" rx="3" ry="2"/><path d="M4 8v9c0 5 16 5 16 0V8M9 8v9M15 8v9"/></>,
    thread: <><path d="M8 2h8v20H8zM6 5l12 3M6 10l12 3M6 15l12 3"/></>,
} satisfies Record<string, ReactNode>
export type CadIconName = keyof typeof drawings
export default function CadIcon({ name }: { name: CadIconName }) {
    return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{drawings[name]}</svg>
}
