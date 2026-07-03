#!/usr/bin/env node

const {execFile} = require("child_process");
const {promisify} = require("util");

const execFileAsync = promisify(execFile);

function print(name, value, detail = "") {
    console.log(`${name}: ${value}${detail ? ` · ${detail}` : ""}`);
}

async function runAppleScript(script, timeout = 10000) {
    try {
        const {stdout} = await execFileAsync("/usr/bin/osascript", ["-e", script], {
            timeout,
            maxBuffer: 1024 * 1024
        });
        return {ok: true, stdout: stdout.trim()};
    } catch (error) {
        const message = (error.stderr || error.message || "").trim();
        return {
            ok: false,
            permissionDenied: message.includes("-1743"),
            error: message || "AppleScript failed"
        };
    }
}

async function isMusicRunning() {
    try {
        await execFileAsync("/usr/bin/pgrep", ["-x", "Music"], {timeout: 3000});
        return true;
    } catch (error) {
        return false;
    }
}

async function main() {
    if (process.platform !== "darwin") {
        print("MUSIC_DIRECT_STATE", "FAIL", "macOS only");
        process.exitCode = 1;
        return;
    }

    print("USES_SYSTEM_EVENTS", "NO");

    const open = await runAppleScript('tell application "Music" to activate\nreturn "opened=true"', 10000);
    print("MUSIC_DIRECT_OPEN", open.ok ? "OK" : "FAIL", open.ok ? "" : open.error);

    const running = await isMusicRunning();
    const state = running
        ? await runAppleScript('tell application "Music" to return (player state as text)', 8000)
        : {ok: false, error: "Music.app is not running"};
    print("MUSIC_DIRECT_STATE", state.ok ? "OK" : "FAIL", state.ok ? state.stdout : state.error);

    const playlists = await runAppleScript('tell application "Music" to return (name of playlists) as text', 12000);
    print("MUSIC_DIRECT_PLAYLISTS", playlists.ok ? "OK" : "FAIL", playlists.ok ? "direct Music playlist query" : playlists.error);

    const track = await runAppleScript(`
tell application "Music"
    if (player state as text) is "stopped" then
        return "NO_TRACK"
    end if
    try
        return (name of current track as text) & " · " & (artist of current track as text)
    on error
        return "NO_TRACK"
    end try
end tell`, 10000);
    print("MUSIC_DIRECT_TRACK", track.ok ? (track.stdout === "NO_TRACK" ? "NO_TRACK" : "OK") : "FAIL", track.ok ? track.stdout : track.error);

    const playPauseOne = await runAppleScript('tell application "Music" to playpause\nreturn "ok=true"', 8000);
    let playPauseTwo = {ok: true};
    if (playPauseOne.ok) {
        await new Promise(resolve => setTimeout(resolve, 500));
        playPauseTwo = await runAppleScript('tell application "Music" to playpause\nreturn "ok=true"', 8000);
    }
    print("MUSIC_DIRECT_PLAYPAUSE", playPauseOne.ok && playPauseTwo.ok ? "OK" : "FAIL", playPauseOne.ok ? (playPauseTwo.error || "") : playPauseOne.error);

    if (!open.ok || !state.ok || !playlists.ok || !track.ok || !playPauseOne.ok || !playPauseTwo.ok) {
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
