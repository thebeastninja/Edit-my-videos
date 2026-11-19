export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="moicut-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#moicut-g)" />
        {/* A frame with a play triangle: "your moment, your cut" */}
        <rect x="7.5" y="9" width="17" height="14" rx="3" fill="none" stroke="white" strokeWidth="2" />
        <path d="M14 12.6v6.8l5.6-3.4z" fill="white" />
      </svg>
      <span className="text-lg font-bold tracking-tight text-white">moicut</span>
    </span>
  );
}
