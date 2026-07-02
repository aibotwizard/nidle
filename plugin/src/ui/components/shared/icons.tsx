// Static SVGs hoisted to module-level constants so they are built once,
// not re-created per render. All geometry is verbatim from the design
// asset — do not tweak coordinates here without a UX review.

export const LogoIcon = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11.5 8 14l5-2.5M3 8 8 10.5 13 8M8 2 3 4.5 8 7l5-2.5L8 2Z" />
  </svg>
);

export const GearIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="2" />
    <path d="M13.4 9.6 14.7 11l-1.3 2.2-1.7-.3a5.4 5.4 0 0 1-1.5.9L9.8 15.5H6.2l-.4-1.7a5.4 5.4 0 0 1-1.5-.9l-1.7.3L1.3 11l1.3-1.4a5.4 5.4 0 0 1 0-3.2L1.3 5 2.6 2.8l1.7.3a5.4 5.4 0 0 1 1.5-.9L6.2.5h3.6l.4 1.7a5.4 5.4 0 0 1 1.5.9l1.7-.3L14.7 5l-1.3 1.4a5.4 5.4 0 0 1 0 3.2Z" />
  </svg>
);

export const CloseIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="3" y1="3" x2="11" y2="11" />
    <line x1="11" y1="3" x2="3" y2="11" />
  </svg>
);

export const UploadIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 10.5V3M5 6l3-3 3 3" />
    <path d="M3 10.5v1.8A1.7 1.7 0 0 0 4.7 14h6.6a1.7 1.7 0 0 0 1.7-1.7v-1.8" />
  </svg>
);

export const UploadIconLarge = (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="#b3b3b3" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 10.5V3M5 6l3-3 3 3" />
    <path d="M3 10.5v1.8A1.7 1.7 0 0 0 4.7 14h6.6a1.7 1.7 0 0 0 1.7-1.7v-1.8" />
  </svg>
);

export const StepCheckIcon = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8.5l3.5 3.5L13 4" />
  </svg>
);

export const DetectedCheckIcon = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#3dd07e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8.5l3.5 3.5L13 4" />
  </svg>
);

export const DoneCheckIcon = (
  <svg width="26" height="26" viewBox="0 0 16 16" fill="none" stroke="#3dd07e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8.5l3.5 3.5L13 4" />
  </svg>
);

export const FolderIcon = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="#7a7a7a">
    <path d="M2 4.2a1 1 0 0 1 1-1h2.6l1.2 1.3H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.2Z" />
  </svg>
);

export const FileIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#7a7a7a" strokeWidth="1.3">
    <path d="M4 2h5l3 3v9H4V2Z" />
    <path d="M9 2v3h3" />
  </svg>
);

export const CollectionIcon = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#9a9a9a" strokeWidth="1.4">
    <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.2" />
    <path d="M8 2.4v11.2M2.4 8h11.2" />
  </svg>
);

export const SpinnerIcon = (
  <svg width="46" height="46" viewBox="0 0 46 46" style={{ animation: "spin 0.9s linear infinite" }}>
    <circle cx="23" cy="23" r="19" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
    <circle cx="23" cy="23" r="19" fill="none" stroke="#0d99ff" strokeWidth="4" strokeLinecap="round" strokeDasharray="40 200" />
  </svg>
);
