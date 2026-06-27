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
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Switch,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { downloadClip, resolveClipFromUrl, UnsupportedLocalExtractionError } from './src/services/clipResolver';
import { copyCaption, openInstagramComposer } from './src/services/instagramShare';
import { ClipMetadata, ClipStatus, DownloadedClip } from './src/types/clip';
import { debugError, debugStep } from './src/lib/debugLog';
import { rememberBackendHostFromUrl } from './src/lib/backendUrl';
import {
  buildDefaultCta,
  clearCaptionRefineSettings,
  defaultCaptionRefineSettings,
  loadCaptionRefineSettings,
  normalizeHandle,
  saveCaptionRefineSettings,
  type CaptionRefineSettings
} from './src/lib/captionRefineSettings';
import { refineCaptionWithOpenRouter } from './src/services/openRouter';

const exampleUrl = 'https://www.instagram.com/reel/SHORTCODE/';

export default function App() {
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<ClipStatus>('idle');
  const [clip, setClip] = useState<ClipMetadata | null>(null);
  const [downloadedClip, setDownloadedClip] = useState<DownloadedClip | null>(null);
  const [message, setMessage] = useState('Paste or share an Instagram Reel/Post link to begin.');
  const previewReveal = useRef(new Animated.Value(0)).current;
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settings, setSettings] = useState<CaptionRefineSettings>(defaultCaptionRefineSettings);
  const [settingsDraft, setSettingsDraft] = useState<CaptionRefineSettings>(defaultCaptionRefineSettings);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineError, setRefineError] = useState('');

  const canResolve = useMemo(() => url.trim().length > 0 && status !== 'resolving', [status, url]);
  const captionLength = caption.trim().length;
  const hasApiKey = settings.apiKey.trim().length > 0;

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

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const stored = await loadCaptionRefineSettings();
        if (!mounted) {
          return;
        }

        const normalized = {
          ...defaultCaptionRefineSettings,
          ...stored,
          brandHandle: normalizeHandle(stored.brandHandle),
          ctaText: stored.ctaText.trim() || buildDefaultCta(stored.brandHandle)
        };

        setSettings(normalized);
        setSettingsDraft(normalized);
      } catch (error) {
        debugError('settings:load-failed', error);
      } finally {
        if (mounted) {
          setSettingsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

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

  const openSettings = useCallback(() => {
    setSettingsDraft(settings);
    setRefineError('');
    setSettingsVisible(true);
  }, [settings]);

  const closeSettings = useCallback(() => {
    if (settingsSaving) {
      return;
    }

    setSettingsVisible(false);
    setSettingsDraft(settings);
    setRefineError('');
  }, [settings, settingsSaving]);

  const saveSettings = useCallback(async () => {
    setSettingsSaving(true);
    setRefineError('');

    try {
      const normalized: CaptionRefineSettings = {
        ...settingsDraft,
        apiKey: settingsDraft.apiKey.trim(),
        model: settingsDraft.model.trim() || defaultCaptionRefineSettings.model,
        brandHandle: normalizeHandle(settingsDraft.brandHandle),
        ctaText: settingsDraft.ctaText.trim() || buildDefaultCta(settingsDraft.brandHandle)
      };

      await saveCaptionRefineSettings(normalized);
      setSettings(normalized);
      setSettingsDraft(normalized);
      setSettingsVisible(false);
      debugStep('settings:saved', {
        model: normalized.model,
        hasKey: Boolean(normalized.apiKey),
        brandHandle: normalized.brandHandle
      });
    } catch (error) {
      debugError('settings:save-failed', error);
      setRefineError(error instanceof Error ? error.message : 'Could not save settings.');
    } finally {
      setSettingsSaving(false);
    }
  }, [settingsDraft]);

  const clearSavedSettings = useCallback(async () => {
    setSettingsSaving(true);
    setRefineError('');

    try {
      await clearCaptionRefineSettings();
      setSettings(defaultCaptionRefineSettings);
      setSettingsDraft(defaultCaptionRefineSettings);
      debugStep('settings:cleared');
    } catch (error) {
      debugError('settings:clear-failed', error);
      setRefineError(error instanceof Error ? error.message : 'Could not clear settings.');
    } finally {
      setSettingsSaving(false);
    }
  }, []);

  const refineCaption = useCallback(async () => {
    if (!caption.trim()) {
      setMessage('Add or load a caption before refining it.');
      return;
    }

    if (!hasApiKey) {
      setRefineError('Add your OpenRouter API key in Settings first.');
      setSettingsVisible(true);
      return;
    }

    setRefineLoading(true);
    setRefineError('');
    setMessage('Refining caption with OpenRouter...');

    try {
      const result = await refineCaptionWithOpenRouter(caption, settings, clip?.title);
      const originalCaption = caption.trim();
      const refinedCaption = result.refinedCaption.trim();
      setCaption(refinedCaption || originalCaption);
      setMessage('Caption refined. Review it, then copy or open Instagram.');
      debugStep('ui:refine-success', {
        refinedLength: result.refinedCaption.length,
        shortLength: result.shortCaption.length,
        hashtagCount: result.hashtags.length
      });
    } catch (error) {
      debugError('ui:refine-failed', error);
      setRefineError(error instanceof Error ? error.message : 'Refine failed.');
      setMessage(error instanceof Error ? error.message : 'Refine failed.');
    } finally {
      setRefineLoading(false);
    }
  }, [caption, clip?.title, hasApiKey, settings]);

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
              <Pressable accessibilityRole="button" onPress={openSettings} style={styles.heroMark}>
                <MaterialCommunityIcons name="cog-outline" size={24} color="#161616" />
              </Pressable>
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
                <View style={styles.captionHeaderActions}>
                  <Text style={styles.captionCount}>{captionLength} chars</Text>
                  <TinyIconButton
                    icon="auto-fix"
                    label={refineLoading ? 'Refining' : 'Refine'}
                    loading={refineLoading}
                    onPress={() => void refineCaption()}
                    disabled={refineLoading || settingsLoading}
                  />
                </View>
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
      <SettingsModal
        draft={settingsDraft}
        error={refineError}
        onChange={setSettingsDraft}
        onClear={() => void clearSavedSettings()}
        onClose={closeSettings}
        onSave={() => void saveSettings()}
        saving={settingsSaving}
        visible={settingsVisible}
      />
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

function TinyIconButton({
  disabled,
  icon,
  label,
  loading,
  onPress
}: {
  disabled?: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tinyButton,
        disabled ? styles.disabledButton : null,
        pressed && !disabled ? styles.pressedButton : null
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#111111" size="small" />
      ) : (
        <MaterialCommunityIcons name={icon} size={14} color="#111111" />
      )}
      <Text numberOfLines={1} style={styles.tinyButtonText}>
        {label}
      </Text>
    </Pressable>
  );
}

function ChoiceChip<T extends string>({
  label,
  selected,
  onPress
}: {
  label: T;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceChip,
        selected ? styles.choiceChipSelected : null,
        pressed ? styles.pressedButton : null
      ]}
    >
      <Text style={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function SettingsModal({
  draft,
  error,
  onChange,
  onClear,
  onClose,
  onSave,
  saving,
  visible
}: {
  draft: CaptionRefineSettings;
  error: string;
  onChange: (settings: CaptionRefineSettings) => void;
  onClear: () => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalKicker}>OpenRouter</Text>
              <Text style={styles.modalTitle}>Caption refine settings</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.modalCloseButton}>
              <MaterialCommunityIcons name="close" size={20} color="#111111" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalHint}>
              Save your OpenRouter key locally on this device. Use the options below to control tone, hashtags,
              music references, and the CTA line.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>API key</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => onChange({ ...draft, apiKey: value })}
                placeholder="sk-or-v1-..."
                placeholderTextColor="#8a8a8a"
                secureTextEntry
                style={styles.input}
                value={draft.apiKey}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Model</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => onChange({ ...draft, model: value })}
                placeholder="~openai/gpt-latest"
                placeholderTextColor="#8a8a8a"
                style={styles.input}
                value={draft.model}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Tone</Text>
              <View style={styles.chipRow}>
                {(['balanced', 'clean', 'playful', 'polished', 'bold'] as const).map((tone) => (
                  <ChoiceChip
                    key={tone}
                    label={tone}
                    onPress={() => onChange({ ...draft, tone })}
                    selected={draft.tone === tone}
                  />
                ))}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Length</Text>
              <View style={styles.chipRow}>
                {(['short', 'balanced', 'detailed'] as const).map((length) => (
                  <ChoiceChip
                    key={length}
                    label={length}
                    onPress={() => onChange({ ...draft, length })}
                    selected={draft.length === length}
                  />
                ))}
              </View>
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleLabel}>Hashtags</Text>
                <Text style={styles.toggleHint}>Let the model add hashtags if they fit.</Text>
              </View>
              <Switch
                onValueChange={(value) => onChange({ ...draft, allowHashtags: value })}
                value={draft.allowHashtags}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleLabel}>Music references</Text>
                <Text style={styles.toggleHint}>Allow or avoid song/music mentions.</Text>
              </View>
              <Switch
                onValueChange={(value) => onChange({ ...draft, allowMusicReferences: value })}
                value={draft.allowMusicReferences}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleLabel}>Emoji</Text>
                <Text style={styles.toggleHint}>Preserve emoji if they help the caption.</Text>
              </View>
              <Switch
                onValueChange={(value) => onChange({ ...draft, preserveEmoji: value })}
                value={draft.preserveEmoji}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Username / handle</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => {
                  const brandHandle = normalizeHandle(value);
                  onChange({
                    ...draft,
                    brandHandle,
                    ctaText: draft.ctaText.trim() || buildDefaultCta(brandHandle)
                  });
                }}
                placeholder="@yourhandle"
                placeholderTextColor="#8a8a8a"
                style={styles.input}
                value={draft.brandHandle}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>CTA line</Text>
              <TextInput
                autoCapitalize="sentences"
                autoCorrect
                onChangeText={(value) => onChange({ ...draft, ctaText: value })}
                placeholder="Follow @yourhandle for more updates."
                placeholderTextColor="#8a8a8a"
                style={styles.input}
                value={draft.ctaText}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={onClear} style={styles.modalSecondaryButton}>
                <Text style={styles.modalSecondaryButtonText}>Clear saved key</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onSave} style={styles.modalPrimaryButton}>
                {saving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>Save settings</Text>
                )}
              </Pressable>
            </View>

            {error ? <Text style={styles.modalError}>{error}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  tinyButton: {
    alignItems: 'center',
    backgroundColor: '#f1ecdf',
    borderColor: '#d9cfbc',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  tinyButtonText: {
    color: '#111111',
    fontSize: 12,
    fontWeight: '800'
  },
  choiceChip: {
    alignItems: 'center',
    backgroundColor: '#f4f1ea',
    borderColor: '#dbd3c3',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  choiceChipSelected: {
    backgroundColor: '#111111',
    borderColor: '#111111'
  },
  choiceChipText: {
    color: '#44403c',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize'
  },
  choiceChipTextSelected: {
    color: '#ffffff'
  },
  fieldGroup: {
    gap: 8
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  toggleRow: {
    alignItems: 'center',
    backgroundColor: '#fbf8f0',
    borderColor: '#e2d8c5',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12
  },
  toggleCopy: {
    flex: 1,
    paddingRight: 12
  },
  toggleLabel: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '800'
  },
  toggleHint: {
    color: '#6b6256',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4
  },
  modalBackdrop: {
    backgroundColor: 'rgba(17,17,17,0.55)',
    flex: 1,
    justifyContent: 'flex-end'
  },
  modalCard: {
    backgroundColor: '#f4f1ea',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '92%',
    paddingHorizontal: 16,
    paddingTop: 14
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  modalCloseButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#ddd5c5',
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  modalKicker: {
    color: '#6b6256',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  modalTitle: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4
  },
  modalContent: {
    gap: 14,
    paddingBottom: 18,
    paddingTop: 14
  },
  modalHint: {
    color: '#4f473d',
    fontSize: 13,
    lineHeight: 19
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4
  },
  modalSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f0ebe1',
    borderColor: '#ddd5c5',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12
  },
  modalSecondaryButtonText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '800'
  },
  modalPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12
  },
  modalPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  modalError: {
    color: '#9b1c1c',
    fontSize: 13,
    lineHeight: 18
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
  captionHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  captionCount: {
    color: '#7c7467',
    fontSize: 11,
    fontWeight: '800'
  }
});
