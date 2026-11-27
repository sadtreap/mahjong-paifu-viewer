import { SettingsProvider } from "./ui/settings/SettingsProvider";
import { Shell } from "./ui/shell/Shell";
import { Viewer } from "./ui/Viewer";

/**
 * The app: SettingsProvider holds the preferences, Shell does the loading (the load form, drop and
 * paste anywhere, `?sample=` and `?tenhou=` addresses), the landing card shown while no game is
 * loaded and the app dialogs, and Viewer replays the loaded game.
 */
export function App() {
  return (
    <SettingsProvider>
      <Shell renderViewer={(props) => <Viewer {...props} />} />
    </SettingsProvider>
  );
}
