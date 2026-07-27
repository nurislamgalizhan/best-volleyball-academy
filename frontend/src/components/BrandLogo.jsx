const LOGO_SOURCES = {
  full: '/brand/bva-logo.png',
  mark: '/brand/bva-mark.png',
};

export default function BrandLogo({ variant = 'mark', className = '' }) {
  return (
    <img
      src={LOGO_SOURCES[variant] ?? LOGO_SOURCES.mark}
      alt="Best Volleyball Academy"
      className={`block object-contain ${className}`}
      draggable="false"
    />
  );
}
