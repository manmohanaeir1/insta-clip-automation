import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { downloadClip, resolveClipFromUrl, UnsupportedLocalExtractionError } from './src/services/clipResolver';
import { copyCaption, openInstagramComposer } from './src/services/instagramShare';
import { ClipMetadata, ClipStatus, DownloadedClip } from './src/types/clip';
import { debugError, debugStep } from './src/lib/debugLog';
import { rememberBackendHostFromUrl } from './src/lib/backendUrl';

const exampleUrl = 'https://www.instagram.com/reel/SHORTCODE/';

export default function App() {
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<ClipStatus>('idle');
  const [clip, setClip] = useState<ClipMetadata | null>(null);
  const [downloadedClip, setDownloadedClip] = useState<DownloadedClip | null>(null);
  const [message, setMessage] = useState('Paste or share an Instagram Reel/Post link to begin.');
  const previewReveal = useRef(new Animated.Value(0)).current;

  const canResolve = useMemo(() => url.trim().length > 0 && status !== 'resolving', [status, url]);
  const captionLength = caption.trim().length;

  useEffect(() => {
    previewReveal.setValue(0);

    if (!clip) {
      return;
    }

    Animated.timing(previewReveal, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [clip, previewReveal]);

  const resolveUrl = useCallback(
    async (candidateUrl = url) => {
      debugStep('ui:check-pressed', {
        candidateUrl,
        currentStatus: status
      });

      if (!candidateUrl.trim()) {
        debugStep('ui:check-empty-url');
        setMessage('Paste an Instagram Reel/Post link first.');
        return;
      }

      setStatus('resolving');
      setMessage('Checking link...');
      setDownloadedClip(null);

      try {
        const metadata = await resolveClipFromUrl(candidateUrl);
        debugStep('ui:resolve-success', {
          normalizedUrl: metadata.normalizedUrl,
          mediaKind: metadata.mediaKind,
          captionLength: metadata.caption.length
        });
        setClip(metadata);
        setCaption(metadata.caption);
        setUrl(metadata.normalizedUrl);
        setStatus('ready');
        setMessage(metadata.mediaKind === 'video' ? 'Video found. Download it, then open Instagram.' : 'Media found. Download it, then open Instagram.');
      } catch (error) {
        debugError('ui:resolve-failed', error, { candidateUrl });
        setClip(null);
        setCaption('');
        setStatus(error instanceof UnsupportedLocalExtractionError ? 'unsupported' : 'error');
        setMessage(error instanceof Error ? error.message : 'Could not resolve this link.');
      }
    },
    [status, url]
  );

  const pasteFromClipboard = useCallback(async () => {
    debugStep('ui:paste-pressed');
    const clipboardText = await Clipboard.getStringAsync();
    debugStep('ui:clipboard-read', {
      hasText: Boolean(clipboardText.trim()),
      textLength: clipboardText.length
    });

    if (!clipboardText.trim()) {
      setMessage('Clipboard is empty.');
      return;
    }

    setUrl(clipboardText);
    await resolveUrl(clipboardText);
  }, [resolveUrl]);

  const downloadCurrentClip = useCallback(async () => {
    debugStep('ui:download-pressed', {
      hasClip: Boolean(clip),
      status,
      shortcode: clip?.shortcode
    });

    if (!clip) {
      setMessage('Resolve a link before downloading.');
      return;
    }

    setStatus('downloading');
    setMessage('Preparing local download...');

    try {
      const downloaded = await downloadClip({ ...clip, caption });
      debugStep('ui:download-success', {
        localFileUri: downloaded.localFileUri,
        captionLength: caption.length
      });
      setDownloadedClip(downloaded);
      setStatus('downloaded');
      setMessage('Media downloaded. Caption will be copied before opening Instagram.');
    } catch (error) {
      debugError('ui:download-failed', error, { shortcode: clip.shortcode });
      setStatus(error instanceof UnsupportedLocalExtractionError ? 'unsupported' : 'error');
      setMessage(error instanceof Error ? error.message : 'Download failed.');
    }
  }, [caption, clip, status]);

  const downloadAndOpenInstagram = useCallback(async () => {
    debugStep('ui:open-instagram-pressed', {
      hasClip: Boolean(clip),
      hasDownloadedClip: Boolean(downloadedClip),
      status
    });

    if (!clip) {
      setMessage('Resolve a link before opening Instagram.');
      return;
    }

    let clipToShare = downloadedClip;

    if (!clipToShare) {
      setStatus('downloading');
      setMessage('Downloading media before opening Instagram...');

      try {
        clipToShare = await downloadClip({ ...clip, caption });
        debugStep('ui:auto-download-success', {
          localFileUri: clipToShare.localFileUri,
          shortcode: clipToShare.shortcode
        });
        setDownloadedClip(clipToShare);
        setStatus('downloaded');
      } catch (error) {
        debugError('ui:auto-download-failed', error, { shortcode: clip.shortcode });
        setStatus(error instanceof UnsupportedLocalExtractionError ? 'unsupported' : 'error');
        setMessage(error instanceof Error ? error.message : 'Download failed.');
        return;
      }
    }

    await copyCaption(caption);
    setMessage('Caption copied. Opening share sheet for Instagram.');
    await openInstagramComposer(clipToShare.localFileUri);
    debugStep('ui:open-instagram-complete');
  }, [caption, clip, downloadedClip, status]);

  useEffect(() => {
    const handleUrl = ({ url: incomingUrl }: { url: string }) => {
      debugStep('ui:incoming-link', { incomingUrl });
      rememberBackendHostFromUrl(incomingUrl);

      if (!incomingUrl || !isInstagramUrl(incomingUrl)) {
        debugStep('ui:incoming-link-ignored', { incomingUrl });
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.heroCopy}>
                <Text style={styles.kicker}>Local clip handoff</Text>
                <Text style={styles.title}>Insta Clip</Text>
                <Text style={styles.subtitle}>
                  Turn a copied Instagram Reel or Post link into a local video, caption, and share-ready handoff.
                </Text>
              </View>
              <View style={styles.heroMark}>
                <MaterialCommunityIcons name="instagram" size={28} color="#161616" />
              </View>
            </View>

            <View style={styles.heroMetaRow}>
              <MetaPill icon="cellphone-link" label={downloadedClip ? 'Cached' : 'Phone local'} />
              <MetaPill icon="shield-check-outline" label="No login" />
              <MetaPill icon="play-circle-outline" label="Reel ready" />
            </View>
          </View>

          <View style={styles.surface}>
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

          <View style={styles.banner}>
            <View style={styles.bannerRow}>
              <StatusBadge status={status} />
              <Text style={styles.bannerMeta}>{clip ? clip.postType.toUpperCase() : 'READY'}</Text>
            </View>
            <Text style={styles.message}>{message}</Text>
          </View>

          {clip ? (
            <Animated.View
              style={[
                styles.surface,
                styles.previewSurface,
                {
                  opacity: previewReveal,
                  transform: [
                    {
                      translateY: previewReveal.interpolate({
                        inputRange: [0, 1],
                        outputRange: [14, 0]
                      })
                    }
                  ]
                }
              ]}
            >
              <View style={styles.previewHeader}>
                <View style={styles.previewHeaderCopy}>
                  <Text style={styles.label}>Preview</Text>
                  <Text style={styles.previewTitle}>{clip.title}</Text>
                  <Text style={styles.previewHint}>
                    {clip.provider} link · {clip.mediaKind ?? 'media'} · {clip.shortcode ?? 'unknown'}
                  </Text>
                </View>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{clip.postType}</Text>
                </View>
              </View>

              <View style={styles.metadataGrid}>
                <MetadataItem label="Provider" value={clip.provider} />
                <MetadataItem label="Shortcode" value={clip.shortcode ?? 'Unknown'} />
              </View>

              {clip.thumbnailUrl ? (
                <ImageBackground
                  imageStyle={styles.thumbnailImage}
                  resizeMode="cover"
                  source={{ uri: clip.thumbnailUrl }}
                  style={styles.thumbnail}
                >
                  <View style={styles.thumbnailTopRow}>
                    <View style={styles.thumbnailBadge}>
                      <MaterialCommunityIcons
                        name={clip.mediaKind === 'video' ? 'play-circle-outline' : 'image-outline'}
                        size={16}
                        color="#ffffff"
                      />
                      <Text style={styles.thumbnailBadgeText}>{clip.mediaKind ?? 'media'}</Text>
                    </View>
                    <View style={styles.thumbnailBadgeSoft}>
                      <Text style={styles.thumbnailBadgeSoftText}>{downloadedClip ? 'On device' : 'Preview'}</Text>
                    </View>
                  </View>
                </ImageBackground>
              ) : null}

              <View style={styles.metadataGrid}>
                <MetadataItem label="Media" value={clip.mediaKind ?? 'Unknown'} />
                <MetadataItem label="Download" value={downloadedClip ? 'Ready' : 'Needed'} />
              </View>

              <View style={styles.captionHeader}>
                <Text style={styles.label}>Caption</Text>
                <Text style={styles.captionCount}>{captionLength} chars</Text>
              </View>
              <TextInput
                multiline
                onChangeText={setCaption}
                placeholder="Caption was not found. You can type or paste one now."
                placeholderTextColor="#8a8a8a"
                style={[styles.input, styles.captionInput]}
                textAlignVertical="top"
                value={caption}
              />

              <View style={styles.actionStack}>
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
                    icon="content-copy"
                    label="Copy Caption"
                    onPress={() => void copyCaption(caption)}
                    variant="secondary"
                  />
                </View>
                <IconButton
                  icon="instagram"
                  label="Open Instagram"
                  loading={status === 'downloading'}
                  onPress={() => void downloadAndOpenInstagram()}
                  variant="primary"
                />
              </View>
            </Animated.View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function isInstagramUrl(candidateUrl: string): boolean {
  try {
    const parsedUrl = new URL(candidateUrl);
    return ['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(parsedUrl.hostname.toLowerCase());
  } catch {
    return /(?:^|\s)(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(candidateUrl);
  }
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
      <Text
        numberOfLines={1}
        style={[styles.buttonText, variant === 'primary' ? styles.primaryButtonText : null]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatusBadge({ status }: { status: ClipStatus }) {
  const config = {
    idle: ['circle-outline', 'Idle'],
    resolving: ['progress-clock', 'Checking'],
    ready: ['check-circle-outline', 'Ready'],
    downloading: ['download-circle-outline', 'Downloading'],
    downloaded: ['check-decagram-outline', 'Cached'],
    unsupported: ['alert-circle-outline', 'Blocked'],
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

function MetaPill({ icon, label }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }) {
  return (
    <View style={styles.metaPill}>
      <MaterialCommunityIcons name={icon} size={14} color="#44403c" />
      <Text style={styles.metaPillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f1ea'
  },
  keyboardAvoidingView: {
    flex: 1
  },
  content: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28
  },
  hero: {
    backgroundColor: '#fffdf8',
    borderColor: '#e4dccd',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  heroTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  heroCopy: {
    flex: 1
  },
  heroMark: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8d0bf',
    borderRadius: 8,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48
  },
  kicker: {
    color: '#6b6256',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  title: {
    color: '#111111',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 4
  },
  subtitle: {
    color: '#544f46',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  metaPill: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#ddd5c5',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  metaPillText: {
    color: '#44403c',
    fontSize: 12,
    fontWeight: '700'
  },
  surface: {
    backgroundColor: '#ffffff',
    borderColor: '#ddd5c5',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  previewSurface: {
    gap: 14
  },
  label: {
    color: '#6b6256',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  input: {
    backgroundColor: '#fbfaf7',
    borderColor: '#d8d0bf',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111111',
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  captionInput: {
    minHeight: 140,
    lineHeight: 20
  },
  actions: {
    flexDirection: 'row',
    gap: 10
  },
  actionStack: {
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
    backgroundColor: '#111111'
  },
  secondaryButton: {
    backgroundColor: '#f0ebe1',
    borderColor: '#ddd5c5',
    borderWidth: 1
  },
  disabledButton: {
    opacity: 0.45
  },
  pressedButton: {
    opacity: 0.82
  },
  buttonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '800'
  },
  primaryButtonText: {
    color: '#ffffff'
  },
  banner: {
    alignItems: 'flex-start',
    backgroundColor: '#efe8dc',
    borderColor: '#ded2bf',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14
  },
  bannerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%'
  },
  bannerMeta: {
    color: '#6b6256',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6
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
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  previewHeaderCopy: {
    flex: 1,
    paddingRight: 12
  },
  previewTitle: {
    color: '#111111',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2
  },
  previewHint: {
    color: '#6b6256',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6
  },
  typeBadge: {
    backgroundColor: '#e4eff0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  typeBadgeText: {
    color: '#165066',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  metadataGrid: {
    flexDirection: 'row',
    gap: 10
  },
  thumbnail: {
    alignItems: 'flex-start',
    aspectRatio: 9 / 16,
    backgroundColor: '#1d1d1d',
    borderColor: '#d8d0bf',
    borderRadius: 8,
    borderWidth: 1,
    width: '100%'
  },
  thumbnailImage: {
    borderRadius: 8
  },
  thumbnailTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    width: '100%'
  },
  thumbnailBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  thumbnailBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase'
  },
  thumbnailBadgeSoft: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  thumbnailBadgeSoftText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '800'
  },
  metadataItem: {
    backgroundColor: '#fbfaf7',
    borderColor: '#ddd5c5',
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
    color: '#111111',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4
  },
  captionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  captionCount: {
    color: '#7c7467',
    fontSize: 11,
    fontWeight: '800'
  }
});
