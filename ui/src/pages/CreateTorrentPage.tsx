import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Code,
  Group,
  List,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useAppStore } from "../store/useAppStore";

const DEFAULT_TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://tracker.openbittorrent.com:6969/announce",
].join("\n");

export function CreateTorrentPage() {
  const paths = useAppStore((s) => s.createTorrentPaths);
  const navigate = useAppStore((s) => s.navigate);
  const handleOpenFiles = useAppStore((s) => s.handleOpenFiles);
  const handleOpenFolder = useAppStore((s) => s.handleOpenFolder);
  const handleCreateTorrent = useAppStore((s) => s.handleCreateTorrent);

  const defaultName =
    paths.length > 0
      ? (paths[0].split(/[/\\]/).filter(Boolean).pop() ?? "untitled")
      : "untitled";

  const [name, setName] = useState(defaultName);
  const [comment, setComment] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [trackers, setTrackers] = useState(DEFAULT_TRACKERS);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (paths.length > 0) {
      const base = paths[0].split(/[/\\]/).filter(Boolean).pop();
      if (base) setName(base);
    }
  }, [paths]);

  return (
    <Stack p="lg" maw={640} gap="md">
      <Title order={2}>Create Torrent</Title>
      <Text size="sm" c="dimmed">
        Choose files or a folder, then create a <Code>.torrent</Code> metadata
        file.
      </Text>

      <Stack gap={6}>
        <Text size="sm" fw={500}>
          Files / folder
        </Text>
        {paths.length === 0 ? (
          <Text size="sm" c="dimmed">
            No files selected
          </Text>
        ) : (
          <List size="sm" spacing={2}>
            {paths.map((p) => (
              <List.Item key={p}>
                <Text size="sm" ff="monospace" lineClamp={1}>
                  {p}
                </Text>
              </List.Item>
            ))}
          </List>
        )}
        <Group gap="sm">
          <Button variant="default" onClick={() => void handleOpenFiles()}>
            Choose files…
          </Button>
          <Button variant="default" onClick={() => void handleOpenFolder()}>
            Choose folder…
          </Button>
        </Group>
      </Stack>

      <TextInput
        label="Torrent name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
      />
      <TextInput
        label="Comment"
        value={comment}
        onChange={(e) => setComment(e.currentTarget.value)}
        placeholder="Optional"
      />
      <Textarea
        label="Trackers"
        minRows={4}
        value={trackers}
        onChange={(e) => setTrackers(e.currentTarget.value)}
        autosize
      />
      <Checkbox
        label="Private torrent"
        checked={isPrivate}
        onChange={(e) => setIsPrivate(e.currentTarget.checked)}
      />

      <Group>
        <Button
          loading={submitting}
          disabled={!name.trim()}
          onClick={() => {
            setSubmitting(true);
            void handleCreateTorrent({
              name: name.trim() || "untitled",
              comment: comment.trim(),
              isPrivate,
              trackers: trackers
                .split(/\r?\n/)
                .map((t) => t.trim())
                .filter(Boolean),
            }).finally(() => setSubmitting(false));
          }}
        >
          Create torrent
        </Button>
        <Button variant="subtle" onClick={() => navigate("torrent-list")}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}
