import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { debugStep } from '../lib/debugLog';

export async function copyCaption(caption: string): Promise<void> {
  debugStep('clipboard:copy-start', { captionLength: caption.length });
  await Clipboard.setStringAsync(caption);
  debugStep('clipboard:copy-success', { captionLength: caption.length });
}

export async function openInstagramComposer(localFileUri?: string): Promise<void> {
  debugStep('share:start', {
    hasLocalFileUri: Boolean(localFileUri),
    platform: Platform.OS
  });

  const sharingAvailable = await Sharing.isAvailableAsync();
  debugStep('share:availability', { sharingAvailable });

  if (localFileUri && sharingAvailable) {
    debugStep('share:share-sheet-open', { localFileUri });
    await Sharing.shareAsync(localFileUri, {
      dialogTitle: 'Open in Instagram'
    });
    debugStep('share:share-sheet-closed');
    return;
  }

  const instagramUrl = Platform.select({
    ios: 'instagram://app',
    android: 'instagram://app',
    default: 'https://www.instagram.com/'
  });

  const canOpen = instagramUrl ? await Linking.canOpenURL(instagramUrl) : false;
  debugStep('share:open-instagram-url', {
    instagramUrl,
    canOpen
  });
  await Linking.openURL(canOpen && instagramUrl ? instagramUrl : 'https://www.instagram.com/');
}
