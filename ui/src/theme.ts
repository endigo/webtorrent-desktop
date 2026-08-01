import { createTheme, type MantineColorsTuple } from "@mantine/core";

/** WebTorrent-inspired dark blue */
const wtBlue: MantineColorsTuple = [
  "#e8f1f7",
  "#d0e0ec",
  "#a3c2d8",
  "#73a2c4",
  "#4b79a1",
  "#3a6285",
  "#2f506c",
  "#283e51",
  "#1e303f",
  "#141e28",
];

export const theme = createTheme({
  primaryColor: "wtBlue",
  colors: {
    wtBlue,
  },
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  defaultRadius: "sm",
  cursorType: "default",
  components: {
    Button: {
      defaultProps: {
        size: "sm",
      },
    },
    TextInput: {
      defaultProps: {
        size: "sm",
      },
    },
    Textarea: {
      defaultProps: {
        size: "sm",
      },
    },
  },
});
