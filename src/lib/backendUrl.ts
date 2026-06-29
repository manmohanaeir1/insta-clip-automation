import * as Linking from 'expo-linking';
import { NativeModules } from 'react-native';
import { debugStep } from './debugLog';

const DEFAULT_BACKEND_PORT = '3000';
const PRODUCTION_BACKEND_URL = 'https://insta-clip-automation-eb3y.onrender.com';
let rememberedLanHost: string | undefined;

export function rememberBackendHostFromUrl(url: string): void {
  const host = getHostFromUrl(url);

  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return;
  }

  rememberedLanHost = host;
  debugStep('backend-url:remember-host', { url, host });
}

export function getBackendUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_BACKEND_URL;

  if (configuredUrl) {
    debugStep('backend-url:env', { backendUrl: configuredUrl });
    return configuredUrl.replace(/\/$/, '');
  }

  const metroHost = rememberedLanHost ?? getExpoHost() ?? getMetroHost();

  if (metroHost) {
    const backendUrl = `http://${metroHost}:${DEFAULT_BACKEND_PORT}`;
    debugStep('backend-url:metro-host', { metroHost, backendUrl });
    return backendUrl;
  }

  debugStep('backend-url:fallback-production', { backendUrl: PRODUCTION_BACKEND_URL });
  return PRODUCTION_BACKEND_URL;
}

function getMetroHost(): string | undefined {
  const sourceCode = NativeModules.SourceCode as { scriptURL?: string } | undefined;
  const scriptUrl = sourceCode?.scriptURL;

  if (!scriptUrl) {
    return undefined;
  }

  try {
    return getHostFromUrl(scriptUrl);
  } catch {
    const match = scriptUrl.match(/\/\/([^:/]+)(?::\d+)?/);
    return match?.[1];
  }
}

function getExpoHost(): string | undefined {
  try {
    const expoUrl = Linking.createURL('');
    const host = getHostFromUrl(expoUrl);

    if (host) {
      debugStep('backend-url:expo-link-host', { expoUrl, host });
    }

    return host;
  } catch {
    return undefined;
  }
}

function getHostFromUrl(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname;
  } catch {
    const match = url.match(/\/\/([^:/]+)(?::\d+)?/);
    return match?.[1];
  }
}
