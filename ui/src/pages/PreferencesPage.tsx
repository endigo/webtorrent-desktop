import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { autostartIsEnabled, openFolder } from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";
import type { AppPrefs } from "../types/prefs";

export function PreferencesPage() {
  const navigate = useAppStore((s) => s.navigate);
  const prefs = useAppStore((s) => s.prefs);
  const prefsLoaded = useAppStore((s) => s.prefsLoaded);
  const loadPrefs = useAppStore((s) => s.loadPrefs);
  const savePrefs = useAppStore((s) => s.savePrefs);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const [draft, setDraft] = useState<AppPrefs>(prefs);
  const [saving, setSaving] = useState(false);
  const [autostartHint, setAutostartHint] = useState<string | null>(null);

  useEffect(() => {
    if (!prefsLoaded) void loadPrefs();
  }, [prefsLoaded, loadPrefs]);

  useEffect(() => {
    setDraft(prefs);
  }, [prefs]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await autostartIsEnabled();
      if (cancelled) return;
      if (result.ok) {
        setDraft((d) => ({ ...d, startup: result.value }));
        setAutostartHint(null);
      } else if (result.reason === "unavailable") {
        setAutostartHint("Autostart plugin not available in this runtime");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = <K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const browseDownloadPath = async () => {
    const result = await openFolder();
    if (result.ok) {
      if (result.paths[0]) patch("downloadPath", result.paths[0]);
      return;
    }
    if (result.reason === "unavailable") {
      setStatusMessage(
        "Folder picker not available yet — edit the path manually",
      );
      return;
    }
    if (result.reason === "error") {
      setStatusMessage(result.message);
    }
  };

  const onDone = async () => {
    setSaving(true);
    try {
      await savePrefs(draft);
      navigate("torrent-list");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack p="lg" maw={640} gap="xl">
      <Title order={2}>Preferences</Title>

      <Stack gap="sm">
        <Title order={4}>Downloads</Title>
        <Group align="flex-end" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            label="Download location"
            value={draft.downloadPath}
            onChange={(e) => patch("downloadPath", e.currentTarget.value)}
          />
          <Button variant="default" onClick={() => void browseDownloadPath()}>
            Browse…
          </Button>
        </Group>
      </Stack>

      <Stack gap="sm">
        <Title order={4}>Playback</Title>
        <Checkbox
          label="Play torrent media files using WebTorrent"
          checked={!draft.openExternalPlayer}
          onChange={(e) => patch("openExternalPlayer", !e.currentTarget.checked)}
        />
        <Checkbox
          label="Highest playback priority"
          checked={draft.highestPlaybackPriority}
          onChange={(e) =>
            patch("highestPlaybackPriority", e.currentTarget.checked)
          }
        />
      </Stack>

      <Stack gap="sm">
        <Title order={4}>System</Title>
        <Checkbox
          label="Open WebTorrent on startup"
          checked={draft.startup}
          onChange={(e) => patch("startup", e.currentTarget.checked)}
        />
        {autostartHint && (
          <Text size="sm" c="dimmed">
            {autostartHint}
          </Text>
        )}
        <Checkbox
          label="Enable sounds"
          checked={draft.soundNotifications}
          onChange={(e) => patch("soundNotifications", e.currentTarget.checked)}
        />
        <Checkbox
          label="Handle .torrent files and magnet links"
          checked={draft.isFileHandler}
          onChange={(e) => patch("isFileHandler", e.currentTarget.checked)}
        />
      </Stack>

      <Group>
        <Button loading={saving} onClick={() => void onDone()}>
          Done
        </Button>
        <Button variant="subtle" onClick={() => navigate("torrent-list")}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}
