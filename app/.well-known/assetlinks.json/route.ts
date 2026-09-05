import { env } from 'cloudflare:workers';

const fingerprintPattern = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export async function GET() {
  const runtime = env as unknown as Record<string, string | undefined>;
  const fingerprints = String(runtime.MEONJEO_ANDROID_SHA256_CERT_FINGERPRINT || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => fingerprintPattern.test(value));

  const statements = fingerprints.length === 0 ? [] : [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: runtime.MEONJEO_ANDROID_PACKAGE_ID || 'com.yorimichiworks.meonjeo',
      sha256_cert_fingerprints: fingerprints,
    },
  }];

  return Response.json(statements, {
    headers: {
      'Cache-Control': fingerprints.length === 0
        ? 'no-store'
        : 'public, max-age=300, must-revalidate',
    },
  });
}
