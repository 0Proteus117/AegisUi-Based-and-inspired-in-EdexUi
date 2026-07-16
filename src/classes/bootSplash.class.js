(function () {
    const SVG_NS = "http://www.w3.org/2000/svg";

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    class BootParticleField {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext("2d", { alpha: true });
            this.reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            this.particles = [];
            this.raf = null;
            this.running = false;
            this.resize = this.resize.bind(this);
            this.tick = this.tick.bind(this);
            window.addEventListener("resize", this.resize, { passive: true });
            this.resize();
        }

        resize() {
            const rect = this.canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.width = Math.max(1, rect.width);
            this.height = Math.max(1, rect.height);
            this.canvas.width = Math.floor(this.width * dpr);
            this.canvas.height = Math.floor(this.height * dpr);
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const count = this.reducedMotion ? 28 : Math.max(54, Math.min(120, Math.floor((this.width * this.height) / 18000)));
            this.particles = Array.from({ length: count }, (_, index) => this.createParticle(index, count));
        }

        createParticle(index, total) {
            const angle = (Math.PI * 2 * index) / total;
            const orbit = 0.18 + Math.random() * 0.62;
            return {
                x: this.width * (0.5 + Math.cos(angle) * orbit * 0.48),
                y: this.height * (0.5 + Math.sin(angle) * orbit * 0.32),
                z: Math.random(),
                vx: (Math.random() - 0.5) * 0.18,
                vy: (Math.random() - 0.5) * 0.16,
                phase: Math.random() * Math.PI * 2,
                radius: 0.8 + Math.random() * 1.8,
                speed: 0.0015 + Math.random() * 0.003
            };
        }

        start() {
            if (this.running) return;
            this.running = true;
            this.tick();
        }

        stop() {
            this.running = false;
            if (this.raf) window.cancelAnimationFrame(this.raf);
            this.raf = null;
            window.removeEventListener("resize", this.resize);
        }

        tick(time = 0) {
            if (!this.running) return;
            this.ctx.clearRect(0, 0, this.width, this.height);

            const centerX = this.width / 2;
            const centerY = this.height / 2;

            for (const particle of this.particles) {
                if (!this.reducedMotion) {
                    particle.phase += particle.speed * 16;
                    particle.x += particle.vx + Math.cos(particle.phase + time * 0.0002) * 0.08;
                    particle.y += particle.vy + Math.sin(particle.phase + time * 0.00018) * 0.07;
                    particle.z = 0.5 + Math.sin(particle.phase) * 0.5;

                    if (particle.x < -20) particle.x = this.width + 20;
                    if (particle.x > this.width + 20) particle.x = -20;
                    if (particle.y < -20) particle.y = this.height + 20;
                    if (particle.y > this.height + 20) particle.y = -20;
                }

                const depth = 0.35 + particle.z * 0.65;
                const alpha = 0.16 + particle.z * 0.34;
                const r = particle.radius * depth;
                this.ctx.beginPath();
                this.ctx.fillStyle = `rgba(64, 210, 255, ${alpha})`;
                this.ctx.arc(particle.x, particle.y, r, 0, Math.PI * 2);
                this.ctx.fill();

                const dx = particle.x - centerX;
                const dy = particle.y - centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < Math.min(this.width, this.height) * 0.34) {
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = `rgba(55, 180, 255, ${Math.max(0, 0.12 - distance / 4200)})`;
                    this.ctx.lineWidth = 0.6;
                    this.ctx.moveTo(particle.x, particle.y);
                    this.ctx.lineTo(centerX + dx * 0.72, centerY + dy * 0.72);
                    this.ctx.stroke();
                }
            }

            this.raf = window.requestAnimationFrame(this.tick);
        }
    }

    class AegisBootSplashController {
        constructor() {
            this.root = null;
            this.logNode = null;
            this.particles = null;
            this.initialized = false;
        }

        ensure() {
            this.root = document.getElementById("boot_screen");
            if (!this.root) {
                this.root = document.createElement("section");
                this.root.id = "boot_screen";
                document.body.appendChild(this.root);
            }

            this.root.classList.add("aegis-boot-screen");
            if (this.initialized && this.root.querySelector(".aegis-boot-content")) return this.root;

            this.root.innerHTML = `
                <canvas class="aegis-boot-particles" aria-hidden="true"></canvas>
                <div class="aegis-boot-glow aegis-boot-glow-a" aria-hidden="true"></div>
                <div class="aegis-boot-glow aegis-boot-glow-b" aria-hidden="true"></div>
                <div class="aegis-boot-content" aria-label="AegisUi startup">
                    <div class="aegis-boot-mark-wrap">
                        ${this.renderMark()}
                    </div>
                    <div class="aegis-boot-title">AEGISUI</div>
                    <div class="aegis-boot-subtitle">ENGINEERING COCKPIT</div>
                    <div class="aegis-boot-status">SYSTEM INITIALIZATION</div>
                </div>
                <div class="aegis-boot-log" data-boot-log></div>
            `;

            this.logNode = this.root.querySelector("[data-boot-log]");
            const canvas = this.root.querySelector(".aegis-boot-particles");
            if (canvas) {
                this.particles = new BootParticleField(canvas);
                this.particles.start();
            }
            this.initialized = true;
            return this.root;
        }

        renderMark() {
            return `
                <svg class="aegis-boot-mark" viewBox="0 0 220 190" role="img" aria-label="AegisUi mark">
                    <defs>
                        <linearGradient id="aegisBootPiece" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#f6fcff"/>
                            <stop offset="46%" stop-color="#bdefff"/>
                            <stop offset="100%" stop-color="#178cff"/>
                        </linearGradient>
                        <filter id="aegisBootGlow" x="-80%" y="-80%" width="260%" height="260%">
                            <feGaussianBlur stdDeviation="5" result="blur"/>
                            <feMerge>
                                <feMergeNode in="blur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                        <path id="aegisBootSegment" d="M59 43.333H161L165 50 161 56.667H59L55 50Z"/>
                    </defs>
                    <g transform="translate(110 95)" filter="url(#aegisBootGlow)">
                        <use class="aegis-boot-piece aegis-boot-piece-a" href="#aegisBootSegment" transform="translate(-110 -95)"/>
                        <use class="aegis-boot-piece aegis-boot-piece-b" href="#aegisBootSegment" transform="rotate(120) translate(-110 -95)"/>
                        <use class="aegis-boot-piece aegis-boot-piece-c" href="#aegisBootSegment" transform="rotate(240) translate(-110 -95)"/>
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
            this.root.classList.add("center", "aegis-boot-title-mode");
            this.root.classList.remove("aegis-boot-exit");
            const status = this.root.querySelector(".aegis-boot-status");
            if (status) status.textContent = "COMENZAMOS";
        }

        exit() {
            if (!this.root) return;
            this.root.classList.add("aegis-boot-exit");
            if (this.particles) {
                setTimeout(() => this.particles && this.particles.stop(), 800);
            }
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
