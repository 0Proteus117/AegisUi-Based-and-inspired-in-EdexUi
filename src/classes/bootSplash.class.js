(function () {
    /*
     * AegisUi / GearLab boot splash.
     *
     * Particle policy mirrors the Aegis GearLab startup experience and the
     * reviewed MIT-licensed cybergenetix-particles / particles.js style:
     * density-aware particles, bounded motion and nearby connection lines.
     * This is intentionally local and dependency-free so the boot screen cannot
     * pull another runtime into AegisUi startup.
     */

    const DEFAULT_NAME = "Gabriel Prada Lareo";

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    class BootParticleField {
        constructor(canvas, getMode) {
            this.canvas = canvas;
            this.ctx = canvas.getContext("2d", { alpha: true });
            this.getMode = getMode;
            this.reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            this.particles = [];
            this.raf = null;
            this.running = false;
            this.lastTick = 0;
            this.bursting = false;
            this.resize = this.resize.bind(this);
            this.tick = this.tick.bind(this);
            window.addEventListener("resize", this.resize, { passive: true });
            document.addEventListener("visibilitychange", () => {
                if (document.hidden) this.pause();
                else this.start();
            });
            this.resize();
        }

        resize() {
            const rect = this.canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            this.width = Math.max(1, rect.width || window.innerWidth || 1280);
            this.height = Math.max(1, rect.height || window.innerHeight || 720);
            this.canvas.width = Math.floor(this.width * dpr);
            this.canvas.height = Math.floor(this.height * dpr);
            this.canvas.style.width = `${this.width}px`;
            this.canvas.style.height = `${this.height}px`;
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const target = this.reducedMotion
                ? Math.max(70, Math.min(115, Math.round((this.width * this.height) / 23000)))
                : Math.max(110, Math.min(205, Math.round((this.width * this.height) / 12500)));

            while (this.particles.length < target) this.particles.push(this.createParticle());
            this.particles.length = target;
        }

        createParticle() {
            return {
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.48,
                vy: (Math.random() - 0.5) * 0.48,
                radius: 0.85 + Math.random() * 1.45,
                alpha: 0.55 + Math.random() * 0.42,
                glow: Math.random() < 0.13,
                burstAlpha: 1
            };
        }

        start() {
            if (this.running) return;
            this.running = true;
            this.lastTick = performance.now();
            this.raf = window.requestAnimationFrame(this.tick);
        }

        pause() {
            this.running = false;
            if (this.raf) window.cancelAnimationFrame(this.raf);
            this.raf = null;
        }

        burst() {
            const centerX = this.width / 2;
            const centerY = this.height * 0.46;
            this.bursting = true;
            for (const particle of this.particles) {
                const dx = particle.x - centerX;
                const dy = particle.y - centerY;
                const distance = Math.max(1, Math.hypot(dx, dy));
                const force = 6.5 + Math.random() * 6.5;
                particle.vx = (dx / distance) * force;
                particle.vy = (dy / distance) * force;
                particle.radius *= 1.15 + Math.random() * 0.9;
                particle.glow = true;
                particle.burstAlpha = 1;
            }
            this.start();
        }

        stop() {
            this.pause();
            window.removeEventListener("resize", this.resize);
            this.particles = [];
            this.ctx.clearRect(0, 0, this.width, this.height);
        }

        tick(now = performance.now()) {
            if (!this.running) return;
            const dt = clamp((now - this.lastTick) / 16.7, 0.25, 2.4);
            this.lastTick = now;
            this.draw(dt);
            this.raf = window.requestAnimationFrame(this.tick);
        }

        palette() {
            if (this.getMode() === "light") {
                return {
                    particle: "0, 170, 245",
                    particleAlpha: 0.78,
                    glow: "0, 183, 245",
                    line: "0, 168, 238",
                    lineAlpha: 0.42,
                    lineWidth: 0.92
                };
            }
            return {
                particle: "215, 232, 246",
                particleAlpha: 0.86,
                glow: "128, 196, 255",
                line: "195, 215, 235",
                lineAlpha: 0.34,
                lineWidth: 0.82
            };
        }

        draw(dt) {
            const ctx = this.ctx;
            const width = this.width;
            const height = this.height;
            const palette = this.palette();
            ctx.clearRect(0, 0, width, height);

            for (const particle of this.particles) {
                if (!this.reducedMotion) {
                    particle.x += particle.vx * dt;
                    particle.y += particle.vy * dt;
                }
                if (this.bursting) {
                    particle.burstAlpha = Math.max(0, particle.burstAlpha - 0.018 * dt);
                    particle.vx *= 0.996;
                    particle.vy *= 0.996;
                }

                if (particle.x < -12) particle.x = width + 12;
                if (particle.x > width + 12) particle.x = -12;
                if (particle.y < -12) particle.y = height + 12;
                if (particle.y > height + 12) particle.y = -12;

                if (particle.glow) {
                    ctx.save();
                    ctx.fillStyle = `rgba(${palette.glow}, ${0.13 * particle.burstAlpha})`;
                    ctx.shadowColor = `rgba(${palette.glow}, ${0.42 * particle.burstAlpha})`;
                    ctx.shadowBlur = this.bursting ? 18 : 10;
                    ctx.beginPath();
                    ctx.arc(particle.x, particle.y, particle.radius * 3, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }

                ctx.beginPath();
                ctx.fillStyle = `rgba(${palette.particle}, ${particle.alpha * palette.particleAlpha * particle.burstAlpha})`;
                ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                ctx.fill();
            }

            const maxDistance = Math.max(170, Math.min(350, Math.sqrt(width * height) / 4.2));
            for (let i = 0; i < this.particles.length; i += 1) {
                const a = this.particles[i];
                for (let j = i + 1; j < this.particles.length; j += 1) {
                    const b = this.particles[j];
                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    const distance = Math.hypot(dx, dy);
                    if (distance >= maxDistance) continue;
                    const fade = Math.pow(1 - distance / maxDistance, 0.72);
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(${palette.line}, ${palette.lineAlpha * fade * Math.min(a.burstAlpha, b.burstAlpha)})`;
                    ctx.lineWidth = palette.lineWidth;
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }
    }

    class AegisBootSplashController {
        constructor() {
            this.root = null;
            this.logNode = null;
            this.particles = null;
            this.initialized = false;
            this.mode = "dark";
            this.displayName = DEFAULT_NAME;
            this.locale = navigator.language || "es";
            this.playSound = true;
            this.startedAt = performance.now();
            this.minimumSequenceMs = 9000;
            this.networkDelayMs = 2000;
            this.titleDelayMs = 4100;
        }

        detectMode() {
            const explicit = window.__aegisBootMode || document.documentElement.dataset.bootMode || document.body?.dataset?.bootMode;
            if (explicit === "light" || explicit === "dark") return explicit;
            return "dark";
        }

        setMode(mode) {
            this.mode = mode === "light" ? "light" : "dark";
            if (this.root) this.root.dataset.theme = this.mode;
        }

        setDisplayName(name) {
            const clean = String(name || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
            this.displayName = clean && !clean.includes("@") ? Array.from(clean).slice(0, 42).join("") : DEFAULT_NAME;
            if (this.root) {
                const welcome = this.root.querySelector(".aegis-boot-welcome");
                if (welcome) welcome.textContent = `${this.displayName}, bienvenido al taller.`;
            }
        }

        configure(next = {}) {
            if (next.locale) this.locale = next.locale;
            if (next.displayName !== undefined) this.setDisplayName(next.displayName);
            if (next.mode || next.appearance) this.setMode(next.mode || next.appearance);
            if (next.playSound !== undefined) this.playSound = Boolean(next.playSound);
            if (Number.isFinite(next.minimumSequenceMs)) this.minimumSequenceMs = Math.max(0, Number(next.minimumSequenceMs));
            if (Number.isFinite(next.networkDelayMs)) this.networkDelayMs = Math.max(0, Number(next.networkDelayMs));
            if (Number.isFinite(next.titleDelayMs)) this.titleDelayMs = Math.max(0, Number(next.titleDelayMs));
            this.renderCopy();
            return this.root;
        }

        localeKey() {
            return String(this.locale || "").toLowerCase().startsWith("es") ? "es" : "en";
        }

        renderCopy() {
            if (!this.root) return;
            const welcome = this.root.querySelector(".aegis-boot-welcome");
            const begin = this.root.querySelector(".aegis-boot-begin");
            const skip = this.root.querySelector(".aegis-boot-skip");
            const isSpanish = this.localeKey() === "es";
            if (welcome) {
                welcome.textContent = isSpanish
                    ? `${this.displayName}, bienvenido al taller.`
                    : `${this.displayName}, welcome to the workshop.`;
            }
            if (begin) begin.textContent = isSpanish ? "Comenzamos" : "Let’s begin";
            if (skip) skip.textContent = isSpanish ? "Omitir" : "Skip";
        }

        remainingSequenceMs() {
            return Math.max(0, this.minimumSequenceMs - (performance.now() - this.startedAt));
        }

        waitForMinimumSequence() {
            return new Promise(resolve => window.setTimeout(resolve, this.remainingSequenceMs()));
        }

        playActivation() {
            if (!this.playSound) return;
            try {
                const Audio = window.AudioContext || window.webkitAudioContext;
                if (!Audio) return;
                const audio = new Audio();
                const gain = audio.createGain();
                const osc = audio.createOscillator();
                const now = audio.currentTime;
                osc.type = "sine";
                osc.frequency.setValueAtTime(180, now);
                osc.frequency.exponentialRampToValueAtTime(420, now + 0.24);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.045, now + 0.035);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
                osc.connect(gain).connect(audio.destination);
                osc.start(now);
                osc.stop(now + 0.4);
                osc.onended = () => audio.close().catch(() => {});
            } catch (error) {
                // Cosmetic only: startup audio must never block AegisUi.
            }
        }

        ensure() {
            this.root = document.getElementById("boot_screen");
            if (!this.root) {
                this.root = document.createElement("section");
                this.root.id = "boot_screen";
                document.body.appendChild(this.root);
            }

            this.root.classList.add("aegis-boot-screen");
            this.setMode(this.detectMode());
            if (this.initialized && this.root.querySelector(".aegis-boot-content")) return this.root;

            this.startedAt = performance.now();

            this.root.innerHTML = `
                <canvas class="aegis-boot-particles" aria-hidden="true"></canvas>
                <div class="aegis-boot-glow aegis-boot-glow-a" aria-hidden="true"></div>
                <div class="aegis-boot-glow aegis-boot-glow-b" aria-hidden="true"></div>
                <div class="aegis-boot-content" aria-label="AegisUi startup">
                    <div class="aegis-boot-mark-wrap">
                        ${this.renderMark()}
                    </div>
                    <div class="aegis-boot-copy">
                        <p class="aegis-boot-welcome">${escapeHtml(this.displayName)}, bienvenido al taller.</p>
                        <p class="aegis-boot-begin">Comenzamos</p>
                    </div>
                </div>
                <button class="aegis-boot-skip" type="button" aria-label="Skip boot screen">Omitir</button>
                <div class="aegis-boot-log" data-boot-log></div>
            `;

            this.logNode = this.root.querySelector("[data-boot-log]");
            const skip = this.root.querySelector(".aegis-boot-skip");
            if (skip) {
                skip.addEventListener("click", () => {
                    this.showTitle();
                    this.exit();
                    window.setTimeout(() => this.remove(), 460);
                });
            }

            const canvas = this.root.querySelector(".aegis-boot-particles");
            if (canvas) {
                this.particles = new BootParticleField(canvas, () => this.mode);
                window.setTimeout(() => {
                    if (!this.root || !this.particles) return;
                    this.root.classList.add("aegis-boot-network-mode");
                    this.particles.start();
                }, this.networkDelayMs);
            }
            this.initialized = true;
            this.renderCopy();
            return this.root;
        }

        renderMark() {
            return `
                <svg class="aegis-boot-mark" viewBox="0 0 220 190" role="img" aria-label="AegisUi GearLab mark" focusable="false">
                    <g class="aegis-boot-piece aegis-boot-piece-a">
                        <path d="M59 43.333L161 43.333L165 50L161 56.667L59 56.667L55 50Z"/>
                    </g>
                    <g class="aegis-boot-piece aegis-boot-piece-b">
                        <path d="M179.552 75.466L128.552 163.801L120.778 163.931L117.005 157.134L168.005 68.799L175.778 68.669Z"/>
                    </g>
                    <g class="aegis-boot-piece aegis-boot-piece-c">
                        <path d="M91.448 163.801L40.448 75.466L44.222 68.669L51.995 68.799L102.995 157.134L99.222 163.931Z"/>
                    </g>
                </svg>
            `;
        }

        appendLog(line) {
            this.ensure();
            if (!this.logNode) return;
            this.logNode.insertAdjacentHTML("beforeend", `${escapeHtml(line)}<br/>`);
            this.logNode.scrollTop = this.logNode.scrollHeight;
        }

        appendRawLine(line) {
            this.ensure();
            if (!this.logNode) return;
            this.logNode.insertAdjacentHTML("beforeend", `${line}<br/>`);
            this.logNode.scrollTop = this.logNode.scrollHeight;
        }

        showTitle() {
            this.ensure();
            const elapsed = performance.now() - this.startedAt;
            const delay = Math.max(0, this.titleDelayMs - elapsed);
            window.setTimeout(() => {
                if (!this.root) return;
                this.root.classList.add("center", "aegis-boot-network-mode", "aegis-boot-title-mode");
                this.root.classList.remove("aegis-boot-exit");
                if (this.particles) this.particles.start();
                this.renderCopy();
            }, delay);
        }

        exit() {
            if (!this.root) return;
            this.root.classList.add("aegis-boot-exit");
            this.playActivation();
            if (this.particles) this.particles.burst();
        }

        remove() {
            if (this.particles) {
                this.particles.stop();
                this.particles = null;
            }
            if (this.root) {
                this.root.remove();
                this.root = null;
            }
            this.initialized = false;
            this.logNode = null;
        }
    }

    window.AegisBootSplash = new AegisBootSplashController();
})();
