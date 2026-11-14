export interface WebManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface WebManifestShape {
  id?: string;
  name?: string;
  short_name?: string;
  description?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  theme_color?: string;
  background_color?: string;
  icons?: WebManifestIcon[];
}

export type PWAInstallMode = 'installed' | 'native' | 'ios' | 'unavailable';

export function isIOSUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

export function isStandaloneDisplayMode(params: {
  matchMediaStandalone: boolean;
  navigatorStandalone?: boolean;
}): boolean {
  return Boolean(params.matchMediaStandalone || params.navigatorStandalone === true);
}

export function getPWAInstallMode(params: {
  isInstalled: boolean;
  hasDeferredPrompt: boolean;
  isIOS: boolean;
}): PWAInstallMode {
  if (params.isInstalled) return 'installed';
  if (params.hasDeferredPrompt) return 'native';
  if (params.isIOS) return 'ios';
  return 'unavailable';
}

export function validateWebManifest(manifest: WebManifestShape): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!manifest.id) errors.push('Manifest missing id.');
  if (!manifest.name || manifest.name.trim().length === 0) {
    errors.push('Manifest missing name.');
  }
  if (!manifest.short_name || manifest.short_name.trim().length === 0) {
    errors.push('Manifest missing short_name.');
  } else if (manifest.short_name.length > 12) {
    errors.push('Manifest short_name exceeds 12 characters.');
  }
  if (manifest.start_url !== '/') errors.push('Manifest start_url must be "/".');
  if (manifest.scope !== '/') errors.push('Manifest scope must be "/".');
  if (manifest.display !== 'standalone') errors.push('Manifest display must be "standalone".');
  if (!manifest.theme_color) errors.push('Manifest missing theme_color.');
  if (!manifest.background_color) errors.push('Manifest missing background_color.');

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const has192Any = icons.some(
    (icon) => icon.sizes.includes('192x192') && icon.type === 'image/png' && icon.purpose === 'any'
  );
  const has512Any = icons.some(
    (icon) => icon.sizes.includes('512x512') && icon.type === 'image/png' && icon.purpose === 'any'
  );
  const has512Maskable = icons.some(
    (icon) =>
      icon.sizes.includes('512x512') && icon.type === 'image/png' && icon.purpose === 'maskable'
  );
  const hasCombinedPurpose = icons.some(
    (icon) => typeof icon.purpose === 'string' && icon.purpose.includes('any') && icon.purpose.includes('maskable')
  );

  if (!has192Any) errors.push('Manifest requires a 192x192 PNG icon with purpose "any".');
  if (!has512Any) errors.push('Manifest requires a 512x512 PNG icon with purpose "any".');
  if (!has512Maskable) {
    errors.push('Manifest requires a separate 512x512 PNG icon with purpose "maskable".');
  }
  if (hasCombinedPurpose) {
    errors.push('Manifest must keep "any" and "maskable" icon purposes separate.');
  }

  return { valid: errors.length === 0, errors };
}
