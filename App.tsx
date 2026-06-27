import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { downloadClip, resolveClipFromUrl, UnsupportedLocalExtractionError } from './src/services/clipResolver';
import { copyCaption, openInstagramComposer } from './src/services/instagramShare';
import { ClipMetadata, ClipStatus, DownloadedClip } from './src/types/clip';

const exampleUrl = 'https://www.instagram.com/reel/SHORTCODE/';

export default function App() {
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<ClipStatus>('idle');
  const [clip, setClip] = useState<ClipMetadata | null>(null);
  const [downloadedClip, setDownloadedClip] = useState<DownloadedClip | null>(null);
  const [message, setMessage] = useState('Paste or share an Instagram Reel/Post link to begin.');

  const canResolve = useMemo(() => url.trim().length > 0 && status !== 'resolving', [status, url]);

  const resolveUrl = useCallback(
    async (candidateUrl = url) => {
      if (!candidateUrl.trim()) {
        setMessage('Paste an Instagram Reel/Post link first.');
        return;
      }

      setStatus('resolving');
      setMessage('Checking link...');
      setDownloadedClip(null);

      try {
        const metadata = await resolveClipFromUrl(candidateUrl);
        setClip(metadata);
        setCaption(metadata.caption);
        setUrl(metadata.normalizedUrl);
        setStatus('ready');
        setMessage('Link is valid. Download support is the next implementation step.');
      } catch (error) {
        setClip(null);
        setCaption('');
        setStatus(error instanceof UnsupportedLocalExtractionError ? 'unsupported' : 'error');
        setMessage(error instanceof Error ? error.message : 'Could not resolve this link.');
      }
    },
    [url]
  );

  const pasteFromClipboard = useCallback(async () => {
    const clipboardText = await Clipboard.getStringAsync();
    if (!clipboardText.trim()) {
      setMessage('Clipboard is empty.');
      return;
    }

    setUrl(clipboardText);
    await resolveUrl(clipboardText);
  }, [resolveUrl]);

  const downloadCurrentClip = useCallback(async () => {
    if (!clip) {
      setMessage('Resolve a link before downloading.');
      return;
    }

    setStatus('downloading');
    setMessage('Preparing local download...');

    try {
      const downloaded = await downloadClip({ ...clip, caption });
      setDownloadedClip(downloaded);
      setStatus('downloaded');
      setMessage('Video is ready. Caption copied before opening Instagram.');
    } catch (error) {
      setStatus(error instanceof UnsupportedLocalExtractionError ? 'unsupported' : 'error');
      setMessage(error instanceof Error ? error.message : 'Download failed.');
    }
  }, [caption, clip]);

  const handoffToInstagram = useCallback(async () => {
    await copyCaption(caption);
    await openInstagramComposer(downloadedClip?.localFileUri);
  }, [caption, downloadedClip]);

  useEffect(() => {
    const handleUrl = ({ url: incomingUrl }: { url: string }) => {
      if (!incomingUrl) {
        return;
      }

      setUrl(incomingUrl);
      void resolveUrl(incomingUrl);
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        handleUrl({ url: initialUrl });
      }
    });

    return () => subscription.remove();
  }, [resolveUrl]);

  const showDownloadNotice = status === 'ready' || status === 'unsupported';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>Local clip handoff</Text>
              <Text style={styles.title}>Insta Clip</Text>
            </View>
            <View style={styles.headerIcon}>
              <MaterialCommunityIcons name="instagram" size={28} color="#161616" />
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.label}>Instagram link</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={setUrl}
              placeholder={exampleUrl}
              placeholderTextColor="#8a8a8a"
              style={styles.input}
              value={url}
            />

            <View style={styles.actions}>
              <IconButton
                icon="clipboard-text-outline"
                label="Paste"
                onPress={pasteFromClipboard}
                variant="secondary"
              />
              <IconButton
                disabled={!canResolve}
                icon="link-variant"
                label={status === 'resolving' ? 'Checking' : 'Check'}
                loading={status === 'resolving'}
                onPress={() => resolveUrl()}
                variant="primary"
              />
            </View>
          </View>

          <View style={styles.statusPanel}>
            <StatusBadge status={status} />
            <Text style={styles.message}>{message}</Text>
          </View>

          {clip ? (
            <View style={styles.panel}>
              <View style={styles.previewHeader}>
                <View>
                  <Text style={styles.label}>Preview</Text>
                  <Text style={styles.previewTitle}>{clip.title}</Text>
                </View>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{clip.postType}</Text>
                </View>
              </View>

              <View style={styles.metadataGrid}>
                <MetadataItem label="Provider" value={clip.provider} />
                <MetadataItem label="Shortcode" value={clip.shortcode ?? 'Unknown'} />
              </View>

              <Text style={styles.label}>Caption</Text>
              <TextInput
                multiline
                onChangeText={setCaption}
                placeholder="Caption will appear here when local extraction supports it. You can type or paste one now."
                placeholderTextColor="#8a8a8a"
                style={[styles.input, styles.captionInput]}
                textAlignVertical="top"
                value={caption}
              />

              {showDownloadNotice ? (
                <View style={styles.notice}>
                  <MaterialCommunityIcons name="information-outline" size={18} color="#57534e" />
                  <Text style={styles.noticeText}>
                    Instagram media extraction is wired as a service boundary. The next step is adding the Android
                    local extractor or a direct media parser for public links.
                  </Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                <IconButton
                  disabled={!clip || status === 'downloading'}
                  icon="download-outline"
                  label={status === 'downloading' ? 'Downloading' : 'Download'}
                  loading={status === 'downloading'}
                  onPress={downloadCurrentClip}
                  variant="secondary"
                />
                <IconButton
                  icon="instagram"
                  label="Open Instagram"
                  onPress={() => {
                    if (!downloadedClip) {
                      Alert.alert(
                        'No downloaded video yet',
                        'Caption will be copied, then Instagram will open. Media sharing needs local extraction to be completed.'
                      );
                    }

                    void handoffToInstagram();
                  }}
                  variant="primary"
                />
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type IconButtonProps = {
  disabled?: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  loading?: boolean;
  onPress: () => void;
  variant: 'primary' | 'secondary';
};

function IconButton({ disabled, icon, label, loading, onPress, variant }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.primaryButton : styles.secondaryButton,
        disabled ? styles.disabledButton : null,
        pressed && !disabled ? styles.pressedButton : null
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : '#161616'} size="small" />
      ) : (
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={variant === 'primary' ? '#ffffff' : '#161616'}
        />
      )}
      <Text style={[styles.buttonText, variant === 'primary' ? styles.primaryButtonText : null]}>{label}</Text>
    </Pressable>
  );
}

function StatusBadge({ status }: { status: ClipStatus }) {
  const config = {
    idle: ['circle-outline', 'Idle'],
    resolving: ['progress-clock', 'Checking'],
    ready: ['check-circle-outline', 'Ready'],
    downloading: ['download-circle-outline', 'Downloading'],
    downloaded: ['check-decagram-outline', 'Downloaded'],
    unsupported: ['alert-circle-outline', 'Needs extractor'],
    error: ['close-circle-outline', 'Error']
  } satisfies Record<ClipStatus, [keyof typeof MaterialCommunityIcons.glyphMap, string]>;

  const [icon, label] = config[status];

  return (
    <View style={styles.badge}>
      <MaterialCommunityIcons name={icon} size={16} color="#161616" />
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metadataItem}>
      <Text style={styles.metadataLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metadataValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f4ef'
  },
  keyboardAvoidingView: {
    flex: 1
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 36
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  kicker: {
    color: '#57534e',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  title: {
    color: '#161616',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 2
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2ddd2',
    borderRadius: 8,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#e2ddd2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  label: {
    color: '#57534e',
    fontSize: 13,
    fontWeight: '700'
  },
  input: {
    backgroundColor: '#fbfaf7',
    borderColor: '#ded8cd',
    borderRadius: 8,
    borderWidth: 1,
    color: '#161616',
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  captionInput: {
    minHeight: 132
  },
  actions: {
    flexDirection: 'row',
    gap: 10
  },
  button: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12
  },
  primaryButton: {
    backgroundColor: '#161616'
  },
  secondaryButton: {
    backgroundColor: '#f0ede6',
    borderColor: '#ded8cd',
    borderWidth: 1
  },
  disabledButton: {
    opacity: 0.45
  },
  pressedButton: {
    opacity: 0.82
  },
  buttonText: {
    color: '#161616',
    fontSize: 15,
    fontWeight: '800'
  },
  primaryButtonText: {
    color: '#ffffff'
  },
  statusPanel: {
    alignItems: 'flex-start',
    backgroundColor: '#efe8dc',
    borderColor: '#ded2bf',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  badgeText: {
    color: '#161616',
    fontSize: 12,
    fontWeight: '800'
  },
  message: {
    color: '#44403c',
    fontSize: 14,
    lineHeight: 20
  },
  previewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  previewTitle: {
    color: '#161616',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2
  },
  typeBadge: {
    backgroundColor: '#e8f1f2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  typeBadgeText: {
    color: '#164e63',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  metadataGrid: {
    flexDirection: 'row',
    gap: 10
  },
  metadataItem: {
    backgroundColor: '#fbfaf7',
    borderColor: '#ece6da',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 10
  },
  metadataLabel: {
    color: '#78716c',
    fontSize: 12,
    fontWeight: '700'
  },
  metadataValue: {
    color: '#161616',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4
  },
  notice: {
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10
  },
  noticeText: {
    color: '#57534e',
    flex: 1,
    fontSize: 13,
    lineHeight: 18
  }
});
