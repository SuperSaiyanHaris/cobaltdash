// Whether the browser is running on macOS or an Apple touch device — used to
// decide if keyboard shortcuts (and their on-screen hints) should read Cmd (⌘)
// or Ctrl. Computed once at module load since navigator.platform can't change
// mid-session. Matches iPhone/iPad/iPod too, since an iPad with a Bluetooth
// keyboard still has a Cmd key.
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
