#!/usr/bin/env node

const {execFile} = require("child_process");
const {promisify} = require("util");

const execFileAsync = promisify(execFile);

function print(name, value, detail = "") {
    console.log(`${name}: ${value}${detail ? ` · ${detail}` : ""}`);
}

function isPermissionError(message = "") {
    return /-1743|not authorized|not authorised|no est[aá]s autorizado/i.test(message);
}

async function runJxa(script, timeout = 10000, maxBuffer = 1024 * 1024) {
    try {
        const {stdout} = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
            timeout,
            maxBuffer
        });
        return {ok: true, stdout: stdout.trim()};
    } catch (error) {
        const message = (error.stderr || error.message || "").trim();
        return {
            ok: false,
            permissionDenied: isPermissionError(message),
            error: message || "JXA Music.app request failed."
        };
    }
}

async function openMusic() {
    try {
        await execFileAsync("/usr/bin/open", ["-a", "Music"], {timeout: 10000});
        return {ok: true};
    } catch (error) {
        return {ok: false, error: (error.stderr || error.message || "").trim() || "Unable to open Music.app"};
    }
}

async function main() {
    if (process.platform !== "darwin") {
        print("MUSIC_OPEN", "FAIL", "macOS only");
        process.exitCode = 1;
        return;
    }

    let failed = false;
    const rawErrors = [];

    const opened = await openMusic();
    print("MUSIC_OPEN", opened.ok ? "OK" : "FAIL", opened.ok ? "Music.app activation requested" : opened.error);
    if (!opened.ok) {
        failed = true;
        rawErrors.push(opened.error);
    }

    const state = await runJxa(`
const Music = Application("Music");
JSON.stringify({state: String(Music.playerState())});
`, 10000);
    if (state.ok) {
        try {
            const data = JSON.parse(state.stdout || "{}");
            print("MUSIC_PLAYER_STATE", "OK", data.state || "unknown");
        } catch (error) {
            print("MUSIC_PLAYER_STATE", "OK", state.stdout || "unknown");
        }
    } else {
        failed = true;
        rawErrors.push(state.error);
        print("MUSIC_PLAYER_STATE", "FAIL", state.error);
    }

    const playlists = await runJxa(`
const Music = Application("Music");
const names = Music.userPlaylists().map(playlist => playlist.name());
JSON.stringify({count: names.length, sample: names.slice(0, 5)});
`, 15000, 2 * 1024 * 1024);
    if (playlists.ok) {
        try {
            const data = JSON.parse(playlists.stdout || "{}");
            print("MUSIC_PLAYLISTS_LIVE", "OK", `${data.count || 0} playlists`);
        } catch (error) {
            print("MUSIC_PLAYLISTS_LIVE", "OK", "live playlist query returned data");
        }
    } else {
        failed = true;
        rawErrors.push(playlists.error);
        print("MUSIC_PLAYLISTS_LIVE", "FAIL", playlists.error);
    }

    const track = await runJxa(`
const Music = Application("Music");
const state = String(Music.playerState());
if (state === "stopped") {
    JSON.stringify({status: "STOPPED"});
} else {
    try {
        const current = Music.currentTrack();
        const properties = current.properties();
        JSON.stringify({
            status: properties && properties.name ? "OK" : "NO_TRACK",
            name: properties.name || "",
            artist: properties.artist || ""
        });
    } catch (error) {
        JSON.stringify({status: "NO_TRACK"});
    }
}
`, 10000);
    if (track.ok) {
        try {
            const data = JSON.parse(track.stdout || "{}");
            const value = ["OK", "STOPPED", "NO_TRACK"].includes(data.status) ? data.status : "NO_TRACK";
            print("MUSIC_TRACK", value, data.name ? `${data.name}${data.artist ? ` · ${data.artist}` : ""}` : "");
        } catch (error) {
            print("MUSIC_TRACK", "OK", track.stdout || "");
        }
    } else {
        failed = true;
        rawErrors.push(track.error);
        print("MUSIC_TRACK", "FAIL", track.error);
    }

    const playPauseOne = await runJxa("Application('Music').playpause(); JSON.stringify({ok:true});", 10000);
    let playPauseTwo = {ok: true};
    if (playPauseOne.ok) {
        await new Promise(resolve => setTimeout(resolve, 500));
        playPauseTwo = await runJxa("Application('Music').playpause(); JSON.stringify({ok:true});", 10000);
    }
    const playPauseOk = playPauseOne.ok && playPauseTwo.ok;
    print("MUSIC_PLAYPAUSE", playPauseOk ? "OK" : "FAIL", playPauseOk ? "round-trip restored previous play state" : (playPauseOne.error || playPauseTwo.error || ""));
    if (!playPauseOk) {
        failed = true;
        rawErrors.push(playPauseOne.error || playPauseTwo.error);
    }

    const next = await runJxa("Application('Music').nextTrack(); JSON.stringify({ok:true});", 10000);
    let previous = {ok: true};
    if (next.ok) {
        await new Promise(resolve => setTimeout(resolve, 500));
        previous = await runJxa("Application('Music').previousTrack(); JSON.stringify({ok:true});", 10000);
    }
    const prevNextOk = next.ok && previous.ok;
    print("MUSIC_PREV_NEXT", prevNextOk ? "OK" : "FAIL", prevNextOk ? "next/previous commands accepted" : (next.error || previous.error || ""));
    if (!prevNextOk) {
        failed = true;
        rawErrors.push(next.error || previous.error);
    }

    if (rawErrors.length) {
        print("RAW_ERROR", rawErrors.map(error => String(error || "").replace(/\s+/g, " ").slice(0, 240)).join(" | "));
    }

    if (failed) process.exitCode = 1;
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
