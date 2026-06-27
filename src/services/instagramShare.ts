import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function copyCaption(caption: string): Promise<void> {
  await Clipboard.setStringAsync(caption);
}

export async function openInstagramComposer(localFileUri?: string): Promise<void> {
  if (localFileUri && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(localFileUri, {
      dialogTitle: 'Open in Instagram'
    });
    return;
  }

  const instagramUrl = Platform.select({
    ios: 'instagram://app',
    android: 'instagram://app',
    default: 'https://www.instagram.com/'
  });

  const canOpen = instagramUrl ? await Linking.canOpenURL(instagramUrl) : false;
  await Linking.openURL(canOpen && instagramUrl ? instagramUrl : 'https://www.instagram.com/');
}
