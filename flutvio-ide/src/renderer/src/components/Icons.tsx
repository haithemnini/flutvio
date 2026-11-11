/**
 * Icons.tsx — small inline SVG icon set (Lucide-style strokes, MIT-compatible shapes).
 */

import React from 'react'

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number }

function base(children: React.ReactNode, strokeWidth = 1.8) {
  return function Icon({ size = 16, ...props }: IconProps): React.JSX.Element {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {children}
      </svg>
    )
  }
}

export const FolderIcon = base(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />)
export const FolderOpenIcon = base(
  <path d="M3 17V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1M3 17l2.4-6.2A2 2 0 0 1 7.3 9.5H21l-2.6 7.1A2 2 0 0 1 16.5 18H4a1 1 0 0 1-1-1z" />,
)
export const FileIcon = base(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </>,
)
export const ChevronDownIcon = base(<path d="m6 9 6 6 6-6" />)
export const ChevronRightIcon = base(<path d="m9 6 6 6-6 6" />)
export const RefreshIcon = base(
  <>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </>,
)
export const PlayIcon = base(<path d="M7 4.5v15l12-7.5z" fill="currentColor" />)
export const StopIcon = base(<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />)
export const ZapIcon = base(<path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" stroke="none" />)
export const RestartIcon = base(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </>,
)
export const CameraIcon = base(
  <>
    <path d="M4 8a2 2 0 0 1 2-2h1.5l1.5-2h6l1.5 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </>,
)
export const PhoneIcon = base(
  <>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  </>,
)
export const TrashIcon = base(
  <>
    <path d="M4 7h16" />
    <path d="M9 7V4.5h6V7" />
    <path d="M6 7l1 13h10l1-13" />
  </>,
)
export const TerminalIcon = base(
  <>
    <path d="m5 8 4 4-4 4" />
    <path d="M12 16h7" />
  </>,
)
export const ListIcon = base(
  <>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" />
  </>,
)
export const XIcon = base(<path d="M6 6l12 12M18 6 6 18" />)
export const HomeIcon = base(
  <>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </>,
)
export const LockIcon = base(
  <>
    <rect x="5" y="11" width="14" height="9.5" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
)
export const VolumeUpIcon = base(
  <>
    <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </>,
)
export const VolumeDownIcon = base(
  <>
    <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
  </>,
)
export const BackIcon = base(<path d="M15 5 8 12l7 7" />)
export const KeyboardIcon = base(
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7.5 14h9" />
  </>,
)
export const LayersIcon = base(
  <>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3 13 9 5 9-5" />
  </>,
)
export const SearchIcon = base(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </>,
)
export const SidebarIcon = base(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M9 4v16" />
  </>,
)
export const PanelBottomIcon = base(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M3 14.5h18" />
  </>,
)
export const PanelRightIcon = base(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M15 4v16" />
  </>,
)
export const SparkleIcon = base(
  <path d="M12 3c.4 3.9 2.1 5.6 6 6-3.9.4-5.6 2.1-6 6-.4-3.9-2.1-5.6-6-6 3.9-.4 5.6-2.1 6-6zM18.5 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5z" />,
  1.6,
)
export const FlaskIcon = base(
  <>
    <path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" />
    <path d="M7.5 15h9" />
  </>,
)
export const CircleAlertIcon = base(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16h.01" />
  </>,
)
export const RotateIcon = base(
  <>
    <rect x="4" y="9" width="12" height="11" rx="2" />
    <path d="M13 3.5h2.5A4.5 4.5 0 0 1 20 8v1.5" />
    <path d="m18 7.5 2 2 2-2" />
  </>,
)
export const BranchIcon = base(
  <>
    <circle cx="6" cy="5.5" r="2" />
    <circle cx="6" cy="18.5" r="2" />
    <circle cx="18" cy="8" r="2" />
    <path d="M6 7.5v9M18 10c0 4-6 3.5-11 7" />
  </>,
)
export const SplitIcon = base(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M12 4v16" />
  </>,
)
export const GlobeIcon = base(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z" />
  </>,
)
export const ArrowUpIcon = base(<path d="M12 19V5m-6 6 6-6 6 6" />)
export const ArrowDownIcon = base(<path d="M12 5v14m-6-6 6 6 6-6" />)
export const ArrowLeftIcon = base(<path d="M19 12H5m6-6-6 6 6 6" />)
export const ArrowRightIcon = base(<path d="M5 12h14m-6-6 6 6-6 6" />)
export const ExternalIcon = base(
  <>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </>,
)
export const CodeIcon = base(<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />)
export const SettingsIcon = base(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
  1.5,
)
/** Window-layout toggle: the pane that is showing is filled. */
export function LayoutIcon({ pane, on, size = 15 }: { pane: 'sidebar' | 'panel' | 'right'; on: boolean; size?: number }): React.JSX.Element {
  const fill = on ? 'currentColor' : 'none'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      {pane === 'sidebar' && <path d="M4 5.5h4.5v13H4z" fill={fill} stroke="none" opacity={0.9} />}
      {pane === 'sidebar' && <path d="M9 4.5v15" />}
      {pane === 'panel' && <path d="M4 14h16v4.5H4z" fill={fill} stroke="none" opacity={0.9} />}
      {pane === 'panel' && <path d="M3 14h18" />}
      {pane === 'right' && <path d="M15.5 5.5H20v13h-4.5z" fill={fill} stroke="none" opacity={0.9} />}
      {pane === 'right' && <path d="M15 4.5v15" />}
    </svg>
  )
}
export const DiffIcon = base(
  <>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <path d="M9 9h6M12 6v6M9 16.5h6" />
  </>,
)
export const HistoryIcon = base(
  <>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
    <path d="M3.5 4v4.5H8M12 7.5V12l3 2" />
  </>,
)
export const PlusIcon = base(<path d="M12 5v14M5 12h14" />)
export const MinusIcon = base(<path d="M5 12h14" />)
export const FitIcon = base(<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />)
export const MoreIcon = base(
  <>
    <circle cx="5.5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1" fill="currentColor" />
  </>,
)
export const CheckIcon = base(<path d="m5 12.5 4.5 4.5L19 7.5" />)
export const PowerIcon = base(
  <>
    <path d="M12 3v8" />
    <path d="M6.3 7a8 8 0 1 0 11.4 0" />
  </>,
)
export const SpinnerIcon = ({ size = 16, className = '', ...props }: IconProps): React.JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={`animate-spin ${className}`}
    aria-hidden="true"
    {...props}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)

/**
 * Flutvio mark — Flutter's diagonal bar with our touch: the lower chevron is a "run" triangle.
 * `FlutvioMark` is the glyph (no background); `FlutvioAppIcon` is the full app icon.
 */
export const FlutvioMark = ({ size = 16 }: { size?: number }): React.JSX.Element => (
  <svg width={size} height={size} viewBox="250 190 520 640" aria-hidden="true">
    <defs>
      <linearGradient id="fv-bar" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5B97FF" />
        <stop offset="1" stopColor="#6E4BFF" />
      </linearGradient>
    </defs>
    <line x1="660" y1="270" x2="352" y2="578" stroke="url(#fv-bar)" strokeWidth="132" strokeLinecap="round" />
    <path d="M500 590 L500 790 L672 690 Z" fill="#8FB1FF" stroke="#8FB1FF" strokeWidth="64" strokeLinejoin="round" />
  </svg>
)

export const FlutvioAppIcon = ({ size = 48 }: { size?: number }): React.JSX.Element => (
  <svg width={size} height={size} viewBox="80 80 864 864" aria-hidden="true">
    <defs>
      <linearGradient id="fv-bg" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor="#3A7BFF" />
        <stop offset="1" stopColor="#5B3FE6" />
      </linearGradient>
      <linearGradient id="fv-shine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.18" />
        <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="80" y="80" width="864" height="864" rx="196" fill="url(#fv-bg)" />
    <rect x="80" y="80" width="864" height="864" rx="196" fill="url(#fv-shine)" />
    <line x1="660" y1="270" x2="352" y2="578" stroke="#FFFFFF" strokeWidth="132" strokeLinecap="round" />
    <path d="M500 590 L500 790 L672 690 Z" fill="#CFE0FF" stroke="#CFE0FF" strokeWidth="64" strokeLinejoin="round" />
  </svg>
)

/** Small file-type glyph for the file tree and editor tabs. */
export function FileTypeIcon({ name, size = 14 }: { name: string; size?: number }): React.JSX.Element {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const [color, label] =
    ext === 'dart'
      ? ['#5bb4f7', 'D']
      : ['yaml', 'yml'].includes(ext)
        ? ['#e57373', 'Y']
        : ext === 'json'
          ? ['#f5a524', '{}']
          : ['md', 'txt'].includes(ext)
            ? ['#8e8e9a', 'M']
            : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)
              ? ['#a78bfa', '▣']
              : ['swift', 'kt', 'java', 'gradle', 'kts'].includes(ext)
                ? ['#f0883e', '◆']
                : ['plist', 'xml', 'xcconfig', 'iml'].includes(ext)
                  ? ['#7c8b9a', '<>']
                  : name === 'pubspec.lock' || ext === 'lock'
                    ? ['#6e6e7a', '•']
                    : ['#6e6e7a', '']
  if (!label)
    return <FileIcon size={size - 1} className="flex-shrink-0" style={{ color }} />
  return (
    <span
      aria-hidden
      className="flex flex-shrink-0 items-center justify-center rounded-[3px] font-mono font-semibold leading-none"
      style={{
        width: size,
        height: size,
        fontSize: label.length > 1 ? size * 0.5 : size * 0.62,
        color,
        background: `${color}1f`,
      }}
    >
      {label}
    </span>
  )
}

export const BellIcon = base(
  <>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" />
    <path d="M10 19a2.2 2.2 0 0 0 4 0" />
  </>,
)
/** Agent monitor: a gauge. */
export const GaugeIcon = base(
  <>
    <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
    <path d="m12 13 3.5-4" />
    <circle cx="12" cy="13.5" r="1" />
  </>,
)
export const PackageIcon = base(
  <>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </>,
)
export const InfoIcon = base(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5h.01" />
  </>,
)
export const LinkIcon = base(
  <>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </>,
)

/** Flutter's mark (filled). */
export function FlutterIcon({ size = 16, ...props }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M14.2 2 3.9 12.3l3.2 3.2L20.6 2z" />
      <path d="m14.2 11.5-5.5 5.5 5.5 5h6.4l-5.4-5 5.4-5.5z" />
    </svg>
  )
}
