GOOSNAV ANIMATION ASSISTANT

Extract this entire folder. Open the launcher matching your computer:
macOS, Windows x64/ARM64, or Linux x86_64/ARM64. Keep app/ beside it.
The launcher opens a setup page, downloads a managed runtime on first use,
then opens the animation interface. No developer tools are required.

Unsigned launchers may trigger macOS or Windows trust prompts. On Linux,
you may need to mark the AppImage executable. Only open builds you trust.

Projects and logs are stored outside this folder:
macOS: ~/Library/Application Support/GoosnavAnimationAssistant/
Windows: %LOCALAPPDATA%/GoosnavAnimationAssistant/
Linux: ~/.local/share/GoosnavAnimationAssistant/ (or XDG_DATA_HOME)

Use Project > Save backup to transfer a clip to another device.
Use Project > Quit local app to stop the local service.
If setup fails, keep the displayed diagnostic code and inspect logs/ in the
application-data directory. Restore missing app/ files from the release,
check your connection, then Retry. Never delete data/ to fix setup.

Platform support must be checked against the release's verification record.
Cross-compiled images alone are not proof of successful native launch.
