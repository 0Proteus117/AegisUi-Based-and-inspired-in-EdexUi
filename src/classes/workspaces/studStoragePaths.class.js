"use strict";

// Main-process-only path boundary. Callers receive this object by dependency
// injection; no path method is exposed through preload or renderer IPC.
const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");
const Model = require("./studAcademicModel.class.js");

const MARKER = ".aegis-stud-storage.json";
const fail = (code, message) => { throw new Model.StudError(code, message); };

function managedReference(value) {
    if (typeof value !== "string" || value.length > 260) fail("INVALID_MANAGED_REFERENCE", "Invalid managed academic reference.");
    const pdf = /^documents\/[a-z0-9_]+_[a-f0-9]{16}\.pdf$/i;
    const data = /^datasets\/[a-z0-9._-]+_[a-f0-9]{16}\.(csv|tsv)$/i;
    const moodle = /^moodle-files\/moodle_file_[a-f0-9]{16}\.[a-z0-9]{1,12}$/i;
    if (!pdf.test(value) && !data.test(value) && !moodle.test(value)) fail("INVALID_MANAGED_REFERENCE", "Only existing managed academic file namespaces are supported.");
    return value;
}

function assertDirectory(absolute) {
    if (!path.isAbsolute(absolute)) fail("INVALID_STORAGE_ROOT", "Storage root must be selected locally.");
    let current = path.parse(absolute).root;
    for (const part of path.relative(current, absolute).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) fail("UNSAFE_STORAGE_PATH", "Storage directory contains a link or non-directory component.");
    }
    return absolute;
}

function macVolumeInfo(absolute) {
    if (process.platform !== "darwin") fail("VOLUME_IDENTITY_UNAVAILABLE", "External volume identity currently requires macOS.");
    try {
        // diskutil accepts a device/mount point, not an arbitrary directory
        // inside it. Resolve only the fixed OS-reported /dev/disk identifier.
        const usage = execFileSync("/bin/df", ["-P", absolute], {timeout:5000, maxBuffer:128*1024, encoding:"utf8", stdio:["ignore","pipe","pipe"]});
        const device = usage.split("\n").slice(1).map(line=>line.match(/^(\/dev\/disk\d+(?:s\d+)*)\s/)).find(Boolean);
        if (!device) fail("VOLUME_IDENTITY_UNAVAILABLE", "The selected directory is not on a supported local disk volume.");
        // Fixed OS tools, fixed options, no shell or renderer-selected executable.
        const plist = execFileSync("/usr/sbin/diskutil", ["info", "-plist", device[1]], {timeout:5000, maxBuffer:128*1024, stdio:["ignore","pipe","pipe"]});
        const data = JSON.parse(execFileSync("/usr/bin/plutil", ["-convert","json","-o","-","-"], {input:plist, timeout:5000, maxBuffer:128*1024, encoding:"utf8"}));
        if (typeof data.VolumeUUID !== "string" || !/^[a-f0-9-]{16,80}$/i.test(data.VolumeUUID) || typeof data.MountPoint !== "string" || !path.isAbsolute(data.MountPoint)) fail("VOLUME_IDENTITY_UNAVAILABLE", "The selected volume has no supported stable identity.");
        return {uuid:data.VolumeUUID.toUpperCase(), mountPoint:path.resolve(data.MountPoint)};
    } catch (error) {
        // Native stderr may contain private paths; it never becomes a UI error.
        if (error instanceof Model.StudError) throw error;
        fail("VOLUME_IDENTITY_UNAVAILABLE", "The selected volume identity could not be verified.");
    }
}

class StudStoragePaths {
    constructor({localRoot, volumeInfo=macVolumeInfo}) {
        // The existing store root is main-owned. Normalize the macOS /var alias
        // once; external selections and managed descendants still reject links.
        this.localRoot = fs.realpathSync(localRoot);
        this.volumeInfo = volumeInfo;
    }
    externalSelection(selectedDirectory) {
        if (typeof selectedDirectory !== "string" || !path.isAbsolute(selectedDirectory)) fail("INVALID_STORAGE_ROOT", "A native storage directory selection is required.");
        try {
            const selected = assertDirectory(path.resolve(selectedDirectory));
            const info = this.volumeInfo(selected);
            const relative = path.relative(info.mountPoint, selected);
            if (relative.startsWith("..") || path.isAbsolute(relative)) fail("INVALID_STORAGE_ROOT", "Selected directory does not belong to the reported volume.");
            return {selected, volumeUuid:info.uuid, mountPoint:info.mountPoint, relative};
        } catch(error) {
            if(error instanceof Model.StudError)throw error;
            fail("STORAGE_OFFLINE", "The selected storage directory is unavailable.");
        }
    }
    profileRoot(profile) {
        if (profile.kind === "LOCAL") return assertDirectory(this.localRoot);
        if (profile.kind !== "EXTERNAL" || typeof profile.mountHint !== "string" || !path.isAbsolute(profile.mountHint) || typeof profile.relativeRoot !== "string" || path.isAbsolute(profile.relativeRoot) || profile.relativeRoot.split(/[\\/]/).some(p=>p===".."||p===".")) fail("INVALID_STORAGE_PROFILE", "Invalid storage profile.");
        const root = path.resolve(profile.mountHint, profile.relativeRoot);
        if (!root.startsWith(`${path.resolve(profile.mountHint)}${path.sep}`)) fail("INVALID_STORAGE_PROFILE", "Storage root must remain below its selected volume.");
        try {
            assertDirectory(root);
            const info = this.volumeInfo(root);
            if (info.uuid !== profile.volumeUuid) fail("WRONG_STORAGE_VOLUME", "The attached volume is not this storage profile's volume.");
            const marker = path.join(root, MARKER), stat = fs.lstatSync(marker);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2048) fail("WRONG_STORAGE_VOLUME", "The storage profile marker is invalid.");
            const value = JSON.parse(fs.readFileSync(marker,"utf8"));
            if (value.version !== 1 || value.profileId !== profile.id || value.nonce !== profile.identityNonce) fail("WRONG_STORAGE_VOLUME", "The selected storage root does not match this profile.");
            return root;
        } catch (error) {
            if (error instanceof Model.StudError) throw error;
            fail("STORAGE_OFFLINE", "Academic storage is disconnected or cannot be inspected.");
        }
    }
    file(profile, reference, {createDirectory=false}={}) {
        const value = managedReference(reference), root = this.profileRoot(profile);
        const directory = path.join(root, value.split("/")[0]);
        if (createDirectory && !fs.existsSync(directory)) fs.mkdirSync(directory,{mode:0o700});
        assertDirectory(directory);
        const absolute = path.join(root,value);
        if (fs.existsSync(absolute)) {
            const stat = fs.lstatSync(absolute);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) fail("UNSAFE_STORAGE_PATH", "Managed file must be a regular file, not a link or special file.");
        } else {
            // existsSync follows symlinks; explicitly reject a dangling link.
            try { fs.lstatSync(absolute); fail("UNSAFE_STORAGE_PATH", "Managed file is an unresolved link."); }
            catch (error) { if (error.code !== "ENOENT") throw error; }
        }
        return absolute;
    }
}

module.exports = {StudStoragePaths, managedReference, assertDirectory, macVolumeInfo, MARKER};
