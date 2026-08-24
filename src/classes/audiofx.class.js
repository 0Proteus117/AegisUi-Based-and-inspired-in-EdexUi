class AudioManager {
    constructor() {
        const {Howl, Howler} = window;
        const audio = name => `assets/audio/${name}`;

        if (window.settings.audio === true) {
            if(window.settings.disableFeedbackAudio === false) {
                this.stdout = new Howl({
                    src: [audio("stdout.wav")],
                    volume: 0.4
                });
                this.stdin = new Howl({
                    src: [audio("stdin.wav")],
                    volume: 0.4
                });
                this.folder = new Howl({
                    src: [audio("folder.wav")]
                });
                this.granted = new Howl({
                    src: [audio("granted.wav")]
                });
            }
            this.keyboard = new Howl({
                src: [audio("keyboard.wav")]
            });
            this.theme = new Howl({
                src: [audio("theme.wav")]
            });
            this.expand = new Howl({
                src: [audio("expand.wav")]
            });
            this.panels = new Howl({
                src: [audio("panels.wav")]
            });
            this.scan = new Howl({
                src: [audio("scan.wav")]
            });
            this.denied = new Howl({
                src: [audio("denied.wav")]
            });
            this.info = new Howl({
                src: [audio("info.wav")]
            });
            this.alarm = new Howl({
                src: [audio("alarm.wav")]
            });
            this.error = new Howl({
                src: [audio("error.wav")]
            });

            Howler.volume(window.settings.audioVolume);
        } else {
            Howler.volume(0.0);
        }

        // Return a proxy to avoid errors if sounds aren't loaded
        return new Proxy(this, {
            get: (target, sound) => {
                if (sound in target) {
                    return target[sound];
                } else {
                    return {
                        play: () => {return true;}
                    }
                }
            }
        });
    }
}

module.exports = {
    AudioManager
};
