import { SettingsProvider } from "./ui/settings/SettingsProvider";
import { Shell } from "./ui/shell/Shell";
import { Viewer } from "./ui/Viewer";

/**
 * The app: SettingsProvider holds the preferences (and the theme), Shell does the loading (file
 * picker, drop and paste anywhere, samples, Tenhou links, `?sample=` and `?tenhou=` addresses),
 * the welcome card and the app dialogs, and Viewer replays the loaded game.
 */
export function App() {
  return (
    <SettingsProvider>
      <Shell renderViewer={(props) => <Viewer {...props} />} />
    </SettingsProvider>
  );
}
