import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  getPWAInstallMode,
  isIOSUserAgent,
  isStandaloneDisplayMode,
  validateWebManifest,
  type WebManifestShape,
} from './pwa';

describe('PWA manifest and install detection', () => {
  it('detects iOS user agents and standalone mode accurately', () => {
    assert.equal(
      isIOSUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'),
      true
    );
    assert.equal(
      isIOSUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)'),
      false
    );

    assert.equal(
      isStandaloneDisplayMode({ matchMediaStandalone: true, navigatorStandalone: false }),
      true
    );
    assert.equal(
      isStandaloneDisplayMode({ matchMediaStandalone: false, navigatorStandalone: true }),
      true
    );
    assert.equal(
      isStandaloneDisplayMode({ matchMediaStandalone: false, navigatorStandalone: false }),
      false
    );
  });

  it('resolves PWA install mode across installed, native, and iOS browsers', () => {
    assert.equal(
      getPWAInstallMode({ isInstalled: true, hasDeferredPrompt: true, isIOS: true }),
      'installed'
    );
    assert.equal(
      getPWAInstallMode({ isInstalled: false, hasDeferredPrompt: true, isIOS: false }),
      'native'
    );
    assert.equal(
      getPWAInstallMode({ isInstalled: false, hasDeferredPrompt: false, isIOS: true }),
      'ios'
    );
    assert.equal(
      getPWAInstallMode({ isInstalled: false, hasDeferredPrompt: false, isIOS: false }),
      'unavailable'
    );
  });

  it('validates public/manifest.json fields, icon files, and index.html PWA tags', () => {
    const publicDir = path.resolve(process.cwd(), 'public');
    const manifestPath = path.join(publicDir, 'manifest.json');
    assert.equal(fs.existsSync(manifestPath), true, 'public/manifest.json must exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as WebManifestShape;
    const validation = validateWebManifest(manifest);
    assert.equal(validation.valid, true, validation.errors.join('; '));

    for (const icon of manifest.icons ?? []) {
      const iconFile = path.join(publicDir, icon.src.replace(/^\//, ''));
      assert.equal(fs.existsSync(iconFile), true, `Missing icon file: ${icon.src}`);
    }
    assert.equal(
      fs.existsSync(path.join(publicDir, 'apple-touch-icon.png')),
      true,
      'Missing public/apple-touch-icon.png'
    );
    assert.equal(
      fs.existsSync(path.join(publicDir, 'favicon.ico')),
      true,
      'Missing public/favicon.ico'
    );
    assert.equal(
      fs.existsSync(path.join(publicDir, 'logo.png')),
      true,
      'Missing public/logo.png'
    );

    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    assert.match(html, /<link\s+rel="manifest"\s+href="\/manifest\.json"/);
    assert.match(html, /<link\s+rel="icon"\s+href="\/favicon\.ico"/);
    assert.match(html, /<meta\s+name="theme-color"\s+content="#0D7A5F"/);
    assert.match(html, /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"/);
    assert.match(html, /<link\s+rel="apple-touch-icon"[^>]+href="\/apple-touch-icon\.png"/);
  });
});
