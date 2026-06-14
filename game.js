/**
 * 奧特宇宙：究極光線對決 - 遊戲邏輯控制
 */

// 動態獲取當前應用的基礎路徑 (解決 GitHub Pages 尾部斜線 404 問題)
function getBasePath() {
    const path = window.location.pathname;
    // 如果是具體檔案 (如 /Ultraman/index.html) -> 回傳 /Ultraman/
    if (path.endsWith('.html')) {
        return path.substring(0, path.lastIndexOf('/') + 1);
    }
    // 如果沒有以斜線結尾 (如 /Ultraman) -> 自動補上 / 成為 /Ultraman/
    if (!path.endsWith('/')) {
        return path + '/';
    }
    return path;
}

const BASE_PATH = getBasePath();

// 獲取目前遊戲縮放比例 (為支援行動端 CSS transform scale 的座標對齊)
function getGameScale() {
    const container = document.getElementById('game-container');
    if (!container) return 1;
    const targetW = 1024;
    const targetH = 768;
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;
    const scaleX = windowW / targetW;
    const scaleY = windowH / targetH;
    return Math.min(scaleX, scaleY);
}

// 檢測螢幕方向與行動裝置，以決定是否顯示轉向提示
function checkOrientation() {
    const rotateOverlay = document.getElementById('rotate-overlay');
    if (!rotateOverlay) return;

    // 寬度小於高度表示是垂直直向螢幕
    const isPortrait = window.innerHeight > window.innerWidth;
    // 檢測是否為行動裝置觸控，或者螢幕寬度較小者
    const isMobile = window.innerWidth < 1024 && (
        'ontouchstart' in window || 
        navigator.maxTouchPoints > 0 || 
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    );

    if (isPortrait && isMobile) {
        rotateOverlay.classList.add('active');
    } else {
        rotateOverlay.classList.remove('active');
    }
}

// ==========================================
// 1. 遊戲資料配置
// ==========================================
const HEROES = [
    {
        id: 'tiga',
        name: '迪卡奧特曼',
        roma: 'ULTRAMAN TIGA',
        hp: 1000,
        atk: 120,
        def: 100,
        specialName: '哉佩利敖光線',
        img: BASE_PATH + 'images/ultraman.jpg',
        color: '#ff2e54',
        desc: '能力均衡，擁有光之守護。',
        hue: 0
    },
    {
        id: 'zero',
        name: '賽羅奧特曼',
        roma: 'ULTRAMAN ZERO',
        hp: 850,
        atk: 150,
        def: 80,
        specialName: '集束賽羅射線',
        img: BASE_PATH + 'images/ultraman.jpg', // 共用立繪
        color: '#00f3ff',
        desc: '高攻擊力，進攻迅捷但防禦較弱。',
        hue: 200
    },
    {
        id: 'taro',
        name: '泰羅奧特曼',
        roma: 'ULTRAMAN TARO',
        hp: 1200,
        atk: 100,
        def: 120,
        specialName: '斯特利姆光線',
        img: BASE_PATH + 'images/ultraman.jpg', // 共用立繪
        color: '#ff7b00',
        desc: '高生命力與堅實防護，擅長持久戰。',
        hue: 330
    }
];

const MONSTERS = [
    {
        id: 'gomora',
        name: '古代怪獸 哥莫拉',
        roma: 'GOMORA',
        hp: 1200,
        atk: 110,
        def: 80,
        img: BASE_PATH + 'images/monster.jpg',
        color: '#ff7b00',
        desc: '強力的尾巴攻擊與地底衝撞。',
        hue: 0
    },
    {
        id: 'zetton',
        name: '宇宙恐龍 杰頓',
        roma: 'ZETTON',
        hp: 1500,
        atk: 140,
        def: 100,
        img: BASE_PATH + 'images/monster.jpg', // 共用立繪
        color: '#cc00ff',
        desc: '防禦力極高，能反彈光線的終極怪獸. ',
        hue: 130
    },
    {
        id: 'baltan',
        name: '宇宙忍者 巴爾坦星人',
        roma: 'ALIEN BALTAN',
        hp: 900,
        atk: 120,
        def: 70,
        img: BASE_PATH + 'images/monster.jpg', // 共用立繪
        color: '#00ff87',
        desc: '幻影分身，動作敏捷且具備干擾能力。',
        hue: 250
    }
];

// 難度設定對應的 QTE 速度與傷害係數
const DIFFICULTY_SETTINGS = {
    normal: { qteSpeed: 0.02, damageMultiplier: 1.0 },
    hard: { qteSpeed: 0.028, damageMultiplier: 1.3 },
    legend: { qteSpeed: 0.035, damageMultiplier: 1.6 }
};

// ==========================================
// 2. 音效管理系統 (Web Audio API 合成音效)
// ==========================================
class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.colorTimerInterval = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                console.warn('此瀏覽器環境不支持 Web Audio API');
                return;
            }
            try {
                this.ctx = new AudioContextClass();
            } catch (e) {
                console.error('無法初始化 AudioContext:', e);
                return;
            }
        }
        // 解除瀏覽器對音訊的自動播放限制 (加 try-catch 以相容舊款 Safari 的 Promise 異常)
        if (this.ctx && this.ctx.state === 'suspended') {
            try {
                this.ctx.resume().catch(err => console.log('Audio resume ignored:', err));
            } catch (e) {
                // 某些舊版 Safari resume() 可能不返回 Promise
                this.ctx.resume();
            }
        }
    }

    createOscillator(type, freq, duration, gainStart, gainEnd = 0.001, delay = 0) {
        if (this.muted || !this.ctx) return null;
        
        // 確保音訊環境正常
        if (this.ctx.state === 'suspended') {
            try {
                this.ctx.resume().catch(() => {});
            } catch (e) {}
        }

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);

        gainNode.gain.setValueAtTime(gainStart, this.ctx.currentTime + delay);
        gainNode.gain.exponentialRampToValueAtTime(gainEnd, this.ctx.currentTime + delay + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + delay);
        osc.stop(this.ctx.currentTime + delay + duration);

        return { osc, gainNode };
    }

    // 點擊按鈕音效
    playClick() {
        this.init();
        this.createOscillator('sine', 600, 0.1, 0.1);
        this.createOscillator('sine', 900, 0.15, 0.05, 0.001, 0.05);
    }

    // 完美的 QTE 判定音效
    playPerfect() {
        this.init();
        this.createOscillator('triangle', 523.25, 0.1, 0.2); // C5
        this.createOscillator('triangle', 659.25, 0.1, 0.15, 0.001, 0.05); // E5
        this.createOscillator('sine', 783.99, 0.2, 0.15, 0.001, 0.1); // G5
        this.createOscillator('sine', 1046.50, 0.3, 0.2, 0.001, 0.15); // C6
    }

    // Great / Good / Miss 判定音效
    playGreat() {
        this.init();
        this.createOscillator('sine', 440, 0.15, 0.15); // A4
        this.createOscillator('sine', 554.37, 0.2, 0.15, 0.001, 0.08); // C#5
    }

    playGood() {
        this.init();
        this.createOscillator('sine', 349.23, 0.2, 0.15); // F4
    }

    playMiss() {
        this.init();
        this.createOscillator('sawtooth', 150, 0.3, 0.25);
        this.createOscillator('sine', 100, 0.4, 0.2, 0.001, 0.1);
    }

    // 物理受擊爆炸音效
    playHit() {
        this.init();
        if (this.muted || !this.ctx) return;
        
        // 合成噪聲以模擬爆炸/物理重擊
        const bufferSize = this.ctx.sampleRate * 0.3; // 0.3 秒
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
        noiseFilter.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.3);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);

        noise.start();
        noise.stop(this.ctx.currentTime + 0.3);

        // 同時加一個低頻正弦波衝擊
        this.createOscillator('sine', 80, 0.2, 0.3);
    }

    // 光線雷射發射音效
    playLaser(duration = 1.5) {
        this.init();
        if (this.muted || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        // 頻率隨時間急劇下滑，營造科幻光線質感
        osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + duration);

        gainNode.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + duration - 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        // 加一個震盪調製器 (Tremolo)，營造雷射的波動感
        const tremolo = this.ctx.createOscillator();
        const tremoloGain = this.ctx.createGain();
        tremolo.type = 'sine';
        tremolo.frequency.setValueAtTime(30, this.ctx.currentTime); // 30Hz 快速震盪
        tremoloGain.gain.setValueAtTime(30, this.ctx.currentTime);
        
        tremolo.connect(tremoloGain);
        tremoloGain.connect(osc.frequency); // 調製光線頻率
        
        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        tremolo.start();
        osc.start();
        
        tremolo.stop(this.ctx.currentTime + duration);
        osc.stop(this.ctx.currentTime + duration);
    }

    // 啟動 Color Timer 的警報嗶嗶聲
    startColorTimerSound() {
        if (this.colorTimerInterval) return;
        this.init();
        
        let blink = true;
        this.colorTimerInterval = setInterval(() => {
            if (this.muted) return;
            // 閃爍發出兩聲短促嗶聲
            this.createOscillator('sine', 1000, 0.12, 0.1);
            setTimeout(() => {
                this.createOscillator('sine', 1000, 0.12, 0.1);
            }, 180);
        }, 1000);
    }

    stopColorTimerSound() {
        if (this.colorTimerInterval) {
            clearInterval(this.colorTimerInterval);
            this.colorTimerInterval = null;
        }
    }

    // 勝利與失敗的簡易旋律
    playVictoryMelody() {
        this.init();
        const notes = [
            { f: 523.25, d: 0.15 }, // C5
            { f: 523.25, d: 0.15 }, // C5
            { f: 523.25, d: 0.15 }, // C5
            { f: 523.25, d: 0.4 },  // C5
            { f: 415.30, d: 0.4 },  // Ab4
            { f: 466.16, d: 0.4 },  // Bb4
            { f: 523.25, d: 0.8 }   // C5
        ];

        let timeOffset = 0;
        notes.forEach(note => {
            this.createOscillator('square', note.f, note.d, 0.08, 0.001, timeOffset);
            timeOffset += note.d + 0.05;
        });
    }

    playDefeatMelody() {
        this.init();
        const notes = [
            { f: 293.66, d: 0.3 },  // D4
            { f: 277.18, d: 0.3 },  // C#4
            { f: 261.63, d: 0.3 },  // C4
            { f: 220.00, d: 0.8 }   // A3
        ];

        let timeOffset = 0;
        notes.forEach(note => {
            this.createOscillator('sawtooth', note.f, note.d, 0.1, 0.001, timeOffset);
            timeOffset += note.d + 0.05;
        });
    }
}

const audio = new SoundManager();

// ==========================================
// 3. Canvas 粒子與特效系統
// ==========================================
class CanvasManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.loop();
    }

    resize() {
        // 固定遊戲內部虛擬解析度，防鋸齒
        this.canvas.width = 1024;
        this.canvas.height = 768;
    }

    addHitParticles(x, y, color, count = 20) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 8;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 4,
                color: color,
                alpha: 1,
                decay: 0.02 + Math.random() * 0.03,
                gravity: 0.1
            });
        }
    }

    addQTEBurst(x, y, color) {
        // 發光環擴散
        for (let i = 0; i < 3; i++) {
            this.particles.push({
                type: 'ring',
                x: x,
                y: y,
                radius: 10,
                maxRadius: 60 + i * 20,
                speed: 3 + i * 2,
                color: color,
                alpha: 0.8,
                decay: 0.04
            });
        }
        // 噴射粒子
        this.addHitParticles(x, y, color, 15);
    }

    addLaserBeam(startX, startY, endX, endY, color) {
        this.particles.push({
            type: 'laser',
            sx: startX,
            sy: startY,
            ex: endX,
            ey: endY,
            width: 25,
            color: color,
            alpha: 1,
            decay: 0.05
        });
    }

    loop() {
        requestAnimationFrame(() => this.loop());
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 更新與渲染粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            if (p.type === 'ring') {
                p.radius += p.speed;
                p.alpha -= p.decay;
                
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.strokeStyle = p.color;
                this.ctx.lineWidth = 4 * p.alpha;
                this.ctx.globalAlpha = p.alpha;
                this.ctx.stroke();
                
                if (p.alpha <= 0) {
                    this.particles.splice(i, 1);
                }
            } 
            else if (p.type === 'laser') {
                p.alpha -= p.decay;
                p.width -= 1;
                
                if (p.width <= 0 || p.alpha <= 0) {
                    this.particles.splice(i, 1);
                    continue;
                }

                this.ctx.save();
                this.ctx.globalAlpha = p.alpha;
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = p.color;

                // 雷射外光束
                this.ctx.beginPath();
                this.ctx.moveTo(p.sx, p.sy);
                this.ctx.lineTo(p.ex, p.ey);
                this.ctx.strokeStyle = p.color;
                this.ctx.lineWidth = p.width;
                this.ctx.lineCap = 'round';
                this.ctx.stroke();

                // 雷射核心白光
                this.ctx.beginPath();
                this.ctx.moveTo(p.sx, p.sy);
                this.ctx.lineTo(p.ex, p.ey);
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = p.width * 0.4;
                this.ctx.stroke();

                this.ctx.restore();
            }
            else {
                // 普通點粒子
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.gravity; // 重力下墜
                p.alpha -= p.decay;

                this.ctx.save();
                this.ctx.globalAlpha = p.alpha;
                this.ctx.shadowBlur = 8;
                this.ctx.shadowColor = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fillStyle = p.color;
                this.ctx.fill();
                this.ctx.restore();

                if (p.alpha <= 0) {
                    this.particles.splice(i, 1);
                }
            }
        }
        
        this.ctx.globalAlpha = 1.0;
    }
}

// ==========================================
// 4. 遊戲核心主控邏輯 (State Machine & Combat)
// ==========================================
class GameEngine {
    constructor() {
        this.canvasManager = null;
        
        // 遊戲狀態變數
        this.selectedHero = HEROES[0];
        this.selectedMonster = MONSTERS[0];
        this.difficulty = 'normal';
        
        // 戰鬥實體數值
        this.heroHp = 1000;
        this.heroMaxHp = 1000;
        this.heroEnergy = 0;
        this.monsterHp = 1200;
        this.monsterMaxHp = 1200;
        this.monsterRage = 0;
        
        // 戰鬥回合與 QTE 控制
        this.currentTurn = 'hero'; // 'hero' | 'monster'
        this.isGameOver = false;
        
        this.activeQtes = [];
        this.qteTotalHits = 0;
        this.qteSuccessHits = 0;
        this.qteTotalDamage = 0;
        this.qteResults = []; // 存儲每次 QTE 判定 ['Perfect', 'Great', ...]
        this.maxCombo = 0;
        this.currentCombo = 0;
        this.totalPerfects = 0;
        this.totalDamageTaken = 0;
        
        // 爆氣狀態 (奧特超人瀕死爆爆)
        this.isDesperationMode = false;

        // QTE 迴圈的計時
        this.qteAnimationFrame = null;

        // 綁定 UI 元素
        this.initDoms();
        this.bindEvents();
        this.renderSelectionCarousels();
        this.fixImagePaths();
    }

    fixImagePaths() {
        // 1. 強制以 JS 動態設定 HTML 初始圖片，保證在任何 URL 斜線配置下皆不發生 404
        if (this.doms.heroImg) {
            this.doms.heroImg.src = BASE_PATH + 'images/ultraman.jpg';
        }
        if (this.doms.monsterImg) {
            this.doms.monsterImg.src = BASE_PATH + 'images/monster.jpg';
        }

        // 2. 強制以 JS 動態設定 CSS 背景圖片，排除 assets/ 資料夾中相對路徑的解析錯誤
        const battleScreen = document.getElementById('battle-screen');
        if (battleScreen) {
            battleScreen.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.6)), url('${BASE_PATH}images/bg.jpg')`;
        }
    }

    initDoms() {
        // 畫面 Dom
        this.screens = {
            menu: document.getElementById('menu-screen'),
            battle: document.getElementById('battle-screen'),
            result: document.getElementById('result-screen')
        };

        // 按鈕
        this.startBtn = document.getElementById('start-btn');
        this.restartBtn = document.getElementById('restart-btn');
        this.menuBtn = document.getElementById('menu-btn');
        this.muteBtn = document.getElementById('mute-btn');
        this.attackBtn = document.getElementById('attack-btn');
        this.specialBtn = document.getElementById('special-btn');

        // HUD 元素
        this.doms = {
            heroName: document.getElementById('battle-hero-name'),
            heroHpBar: document.getElementById('hero-hp-bar'),
            heroHpText: document.getElementById('hero-hp-text'),
            heroEnergyBar: document.getElementById('hero-energy-bar'),
            heroEnergyText: document.getElementById('hero-energy-text'),
            
            monsterName: document.getElementById('battle-monster-name'),
            monsterHpBar: document.getElementById('monster-hp-bar'),
            monsterHpText: document.getElementById('monster-hp-text'),
            monsterRageBar: document.getElementById('monster-rage-bar'),
            monsterRageText: document.getElementById('monster-rage-text'),
            
            turnBanner: document.getElementById('turn-banner'),
            turnText: document.getElementById('turn-text'),
            turnTimer: document.getElementById('turn-timer'),
            colorTimer: document.getElementById('color-timer'),
            
            heroImg: document.getElementById('hero-img'),
            monsterImg: document.getElementById('monster-img'),
            battleStage: document.getElementById('battle-stage'),
            heroFighter: document.getElementById('hero-fighter'),
            monsterFighter: document.getElementById('monster-fighter'),
            
            qteOverlay: document.getElementById('qte-overlay'),
            floatingTextContainer: document.getElementById('floating-text-container'),
            battleLog: document.getElementById('battle-log'),
            screenFlash: document.getElementById('screen-flash'),
            
            actionMenu: document.getElementById('action-menu'),
            specialDesc: document.getElementById('special-desc')
        };
    }

    bindEvents() {
        // 音效管理器初始化
        this.startBtn.addEventListener('click', () => {
            audio.playClick();
            this.startBattle();
        });

        this.restartBtn.addEventListener('click', () => {
            audio.playClick();
            this.switchScreen('menu');
        });

        this.menuBtn.addEventListener('click', () => {
            audio.playClick();
            this.switchScreen('menu');
        });

        // 靜音切換
        this.muteBtn.addEventListener('click', () => {
            audio.muted = !audio.muted;
            this.muteBtn.innerText = audio.muted ? '🔇' : '🔊';
            audio.playClick();
        });

        // 難度選擇
        const diffBtns = document.querySelectorAll('.diff-btn');
        diffBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                audio.playClick();
                diffBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.difficulty = btn.dataset.difficulty;
            });
        });

        // 戰鬥指令
        this.attackBtn.addEventListener('click', () => {
            if (this.currentTurn !== 'hero') return;
            audio.playClick();
            this.executeHeroAttack(false); // 普通攻擊
        });

        this.specialBtn.addEventListener('click', () => {
            if (this.currentTurn !== 'hero' || this.heroEnergy < 100) return;
            audio.playClick();
            this.executeHeroAttack(true); // 必殺技
        });
    }

    switchScreen(screenName) {
        Object.keys(this.screens).forEach(key => {
            this.screens[key].classList.remove('active');
        });
        this.screens[screenName].classList.add('active');
        
        if (screenName === 'menu') {
            audio.stopColorTimerSound();
        }
    }

    renderSelectionCarousels() {
        const heroCarousel = document.getElementById('hero-carousel');
        const monsterCarousel = document.getElementById('monster-carousel');

        heroCarousel.innerHTML = HEROES.map((hero, index) => `
            <div class="char-card ${index === 0 ? 'selected' : ''}" data-hero-id="${hero.id}" style="--hue: ${hero.hue}deg;">
                <img class="char-card-img" src="${hero.img}" alt="${hero.name}">
                <div class="char-card-info">
                    <div class="char-card-name">${hero.name}</div>
                    <div class="char-card-stat">HP ${hero.hp} | ATK ${hero.atk}</div>
                </div>
            </div>
        `).join('');

        monsterCarousel.innerHTML = MONSTERS.map((monster, index) => `
            <div class="char-card ${index === 0 ? 'selected' : ''}" data-monster-id="${monster.id}" style="--hue: ${monster.hue}deg;">
                <img class="char-card-img" src="${monster.img}" alt="${monster.name}">
                <div class="char-card-info">
                    <div class="char-card-name">${monster.name}</div>
                    <div class="char-card-stat">HP ${monster.hp} | ATK ${monster.atk}</div>
                </div>
            </div>
        `).join('');

        // 點擊選擇英雄
        heroCarousel.querySelectorAll('.char-card').forEach(card => {
            card.addEventListener('click', () => {
                audio.playClick();
                heroCarousel.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedHero = HEROES.find(h => h.id === card.dataset.heroId);
            });
        });

        // 點擊選擇怪獸
        monsterCarousel.querySelectorAll('.char-card').forEach(card => {
            card.addEventListener('click', () => {
                audio.playClick();
                monsterCarousel.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedMonster = MONSTERS.find(m => m.id === card.dataset.monsterId);
            });
        });
    }

    // ==========================================
    // 5. 戰鬥系統實作
    // ==========================================
    startBattle() {
        // 初始化 Canvas
        if (!this.canvasManager) {
            this.canvasManager = new CanvasManager('effects-canvas');
        }

        // 初始化數值
        this.heroHp = this.selectedHero.hp;
        this.heroMaxHp = this.selectedHero.hp;
        this.heroEnergy = 0;
        this.isDesperationMode = false;
        
        this.monsterHp = this.selectedMonster.hp;
        this.monsterMaxHp = this.selectedMonster.hp;
        this.monsterRage = 0;

        this.currentTurn = 'hero';
        this.isGameOver = false;
        this.maxCombo = 0;
        this.currentCombo = 0;
        this.totalPerfects = 0;
        this.totalDamageTaken = 0;

        // UI 渲染與設定
        this.doms.heroName.innerText = this.selectedHero.roma;
        this.doms.monsterName.innerText = this.selectedMonster.roma;

        // 設定戰鬥立繪與 hue-rotate 濾鏡
        this.doms.heroImg.src = this.selectedHero.img;
        this.doms.heroImg.style.filter = `hue-rotate(${this.selectedHero.hue}deg)`;
        
        this.doms.monsterImg.src = this.selectedMonster.img;
        this.doms.monsterImg.style.filter = `hue-rotate(${this.selectedMonster.hue}deg)`;

        // Color Timer 重置為藍色常亮
        this.doms.colorTimer.className = 'color-timer blue';
        audio.stopColorTimerSound();

        // 寫入戰鬥日誌
        this.doms.battleLog.innerHTML = '';
        this.logMessage(`戰鬥開始！${this.selectedHero.name} 對決 ${this.selectedMonster.name}`, 'system');
        this.logMessage(`超人已就戰鬥姿勢。你的回合，請選擇進攻動作。`, 'system');

        this.updateHud();
        this.switchScreen('battle');
        this.startHeroTurn();
    }

    logMessage(text, type = 'system') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerText = text;
        this.doms.battleLog.appendChild(entry);
        this.doms.battleLog.scrollTop = this.doms.battleLog.scrollHeight;
    }

    updateHud() {
        // 超人 HP
        const heroHpPct = (this.heroHp / this.heroMaxHp) * 100;
        this.doms.heroHpBar.style.width = `${Math.max(0, heroHpPct)}%`;
        this.doms.heroHpText.innerText = `${Math.round(this.heroHp)} / ${this.heroMaxHp}`;

        // 超人 Energy
        this.doms.heroEnergyBar.style.width = `${this.heroEnergy}%`;
        this.doms.heroEnergyText.innerText = `${this.heroEnergy}%`;

        // 處理能量滿時的發光
        if (this.heroEnergy >= 100) {
            this.specialBtn.classList.remove('disabled');
            this.specialBtn.removeAttribute('disabled');
            this.doms.specialDesc.innerText = '已就緒！發動最強奧義';
        } else {
            this.specialBtn.classList.add('disabled');
            this.specialBtn.setAttribute('disabled', 'true');
            this.doms.specialDesc.innerText = `能量不足 (需 100%)`;
        }

        // 怪獸 HP
        const monsterHpPct = (this.monsterHp / this.monsterMaxHp) * 100;
        this.doms.monsterHpBar.style.width = `${Math.max(0, monsterHpPct)}%`;
        this.doms.monsterHpText.innerText = `${Math.round(this.monsterHp)} / ${this.monsterMaxHp}`;

        // 怪獸 Rage
        this.doms.monsterRageBar.style.width = `${this.monsterRage}%`;
        this.doms.monsterRageText.innerText = `${this.monsterRage}%`;

        // 檢查奧特曼瀕死 Color Timer 爆氣
        if (heroHpPct <= 30 && !this.isDesperationMode && this.heroHp > 0) {
            this.isDesperationMode = true;
            this.doms.colorTimer.className = 'color-timer red-blink';
            audio.startColorTimerSound();
            this.logMessage(`⚠️ 超人能量耗損嚴重！彩色計時器開始閃爍！`, 'miss-hit');
            this.logMessage(`🔥 進入【極限爆氣狀態】：攻擊力提升 50%，但格擋難度提高！`, 'perfect-hit');
            this.flashScreen('red');
        }
    }

    flashScreen(type) {
        this.doms.screenFlash.className = `screen-flash flash-${type}`;
        setTimeout(() => {
            this.doms.screenFlash.className = 'screen-flash';
        }, 80);
    }

    startHeroTurn() {
        if (this.isGameOver) return;
        this.currentTurn = 'hero';
        
        // 更改 Banner 樣式
        this.doms.turnBanner.classList.remove('monster-turn');
        this.doms.turnText.innerText = 'YOUR TURN';
        this.doms.turnTimer.style.width = '0%';

        // 顯示動作按鈕選單
        this.doms.actionMenu.style.pointerEvents = 'auto';
        this.doms.actionMenu.style.opacity = '1';
        
        this.logMessage(`--- 回合開始：請選擇你的戰術 ---`, 'system');
    }

    startMonsterTurn() {
        if (this.isGameOver) return;
        this.currentTurn = 'monster';

        // 更改 Banner 樣式
        this.doms.turnBanner.classList.add('monster-turn');
        this.doms.turnText.innerText = 'ENEMY ATTACK';
        this.doms.turnTimer.style.width = '100%';

        // 隱藏動作選單
        this.doms.actionMenu.style.pointerEvents = 'none';
        this.doms.actionMenu.style.opacity = '0';

        // 延遲發動怪獸進攻
        setTimeout(() => {
            this.executeMonsterAttack();
        }, 1200);
    }

    // ==========================================
    // 6. QTE 運算核心
    // ==========================================
    
    /**
     * 發動 QTE 判定序列
     * @param {string} target 'monster' | 'hero'  (代表QTE圈渲染在哪個角色身上)
     * @param {number} count 出現的點擊個數
     * @param {function} onComplete 當點擊完畢時的 callback
     */
    launchQTESequence(target, count, onComplete) {
        this.activeQtes = [];
        this.qteTotalHits = count;
        this.qteSuccessHits = 0;
        this.qteResults = [];
        
        const qteSpeedSetting = DIFFICULTY_SETTINGS[this.difficulty].qteSpeed;
        // 爆氣狀態下，防禦速度加快 30%
        const speed = (target === 'hero' && this.isDesperationMode) ? qteSpeedSetting * 1.3 : qteSpeedSetting;

        // 獲取目前遊戲縮放比例
        const currentScale = getGameScale();

        // 計算角色在戰鬥舞台中的位置以精準定位 QTE
        const rect = this.doms.battleStage.getBoundingClientRect();
        const wrapper = target === 'monster' ? this.doms.monsterFighter : this.doms.heroFighter;
        const fighterRect = wrapper.getBoundingClientRect();

        // 獲取角色在舞台容器內的相對座標範圍 (除以縮放比例以轉為 CSS 像素)
        const relativeLeft = (fighterRect.left - rect.left) / currentScale;
        const relativeTop = (fighterRect.top - rect.top) / currentScale;
        const width = fighterRect.width / currentScale;
        const height = fighterRect.height / currentScale;

        let currentQteIndex = 0;

        const spawnNextQte = () => {
            if (currentQteIndex >= count) {
                // 回合結束，清除計時，調用 callback
                cancelAnimationFrame(this.qteAnimationFrame);
                onComplete(this.qteResults);
                return;
            }

            // 隨機在角色邊界內產生座標，但保留一點內縮邊距
            const borderPadding = 60;
            const x = relativeLeft + borderPadding + Math.random() * (width - borderPadding * 2);
            const y = relativeTop + borderPadding + Math.random() * (height - borderPadding * 2 - 40);

            // 建立 QTE Dom (若目標是英雄防禦，加入 monster-turn 樣式以渲染紅色判定圈)
            const qteEl = document.createElement('div');
            qteEl.className = `qte-circle${target === 'hero' ? ' monster-turn' : ''}`;
            qteEl.style.left = `${x}px`;
            qteEl.style.top = `${y}px`;

            qteEl.innerHTML = `
                <div class="qte-perfect-guide"></div>
                <div class="qte-core"></div>
                <div class="qte-ring"></div>
            `;

            this.doms.qteOverlay.appendChild(qteEl);

            const ringEl = qteEl.querySelector('.qte-ring');
            let scale = 2.5;
            let clicked = false;

            const updateQteFrame = () => {
                if (clicked) return;

                scale -= speed;
                ringEl.style.transform = `scale(${scale})`;

                if (scale <= 0.75) {
                    // 超時 Miss
                    clicked = true;
                    qteEl.remove();
                    this.handleQteHit('Miss', x, y);
                    currentQteIndex++;
                    setTimeout(spawnNextQte, 300);
                    return;
                }

                this.qteAnimationFrame = requestAnimationFrame(updateQteFrame);
            };

            // 點擊與觸控事件監聽 (使用 pointerdown 以相容滑鼠與觸控屏，並消除移動端 300ms 延遲)
            qteEl.addEventListener('pointerdown', (e) => {
                if (clicked) return;
                clicked = true;
                e.stopPropagation();
                e.preventDefault(); // 阻斷移動端的滑動或雙擊默認動作

                cancelAnimationFrame(this.qteAnimationFrame);
                qteEl.remove();

                // 計算判定等級
                const diff = Math.abs(scale - 1.0);
                let rating = 'Miss';

                if (diff <= 0.12) {
                    rating = 'Perfect';
                    this.totalPerfects++;
                } else if (diff <= 0.25) {
                    rating = 'Great';
                } else if (diff <= 0.46) {
                    rating = 'Good';
                }

                this.handleQteHit(rating, x, y);
                currentQteIndex++;
                setTimeout(spawnNextQte, 300);
            });

            this.qteAnimationFrame = requestAnimationFrame(updateQteFrame);
        };

        // 啟動首個 QTE
        spawnNextQte();
    }

    // 處理單個 QTE 的點擊判定與畫面文字/粒子回饋
    handleQteHit(rating, x, y) {
        let color = '#ff2e54'; // Miss
        
        if (rating === 'Perfect') {
            color = '#00ff87';
            audio.playPerfect();
            this.currentCombo++;
        } else if (rating === 'Great') {
            color = '#ffd700';
            audio.playGreat();
            this.currentCombo++;
        } else if (rating === 'Good') {
            color = '#00f3ff';
            audio.playGood();
            this.currentCombo++;
        } else {
            color = '#ff2e54';
            audio.playMiss();
            this.currentCombo = 0; // Combo 中斷
        }

        // 更新最高 Combo
        if (this.currentCombo > this.maxCombo) {
            this.maxCombo = this.currentCombo;
        }

        // 觸發 Canvas 擴散粒子
        if (rating !== 'Miss') {
            this.canvasManager.addQTEBurst(x, y, color);
        }

        // 顯示漂浮判定文字
        this.showFloatingText(rating, x, y, `text-${rating.toLowerCase()}`);
        this.qteResults.push(rating);
    }

    showFloatingText(text, x, y, className) {
        const span = document.createElement('span');
        span.className = `floating-text ${className}`;
        span.innerText = text;
        span.style.left = `${x}px`;
        span.style.top = `${y}px`;

        // 如果是 Combo，在下面加一小行
        if (this.currentCombo > 1 && (text === 'Perfect' || text === 'Great' || text === 'Good')) {
            span.innerHTML = `${text}<br><span style="font-size:12px;color:#ffd700;">${this.currentCombo} COMBO!</span>`;
        }

        this.doms.floatingTextContainer.appendChild(span);
        setTimeout(() => span.remove(), 800);
    }

    showFloatingDamage(damage, x, y, isCrit = false) {
        const span = document.createElement('span');
        span.className = 'floating-text floating-dmg';
        span.innerText = `-${Math.round(damage)}`;
        span.style.left = `${x}px`;
        span.style.top = `${y}px`;
        
        if (isCrit) {
            span.style.color = '#ffd700';
            span.style.fontSize = '40px';
            span.style.textShadow = '0 0 15px rgba(255, 215, 0, 0.9)';
        }

        this.doms.floatingTextContainer.appendChild(span);
        setTimeout(() => span.remove(), 800);
    }

    // ==========================================
    // 7. 戰鬥招式結算
    // ==========================================

    executeHeroAttack(isSpecial = false) {
        // 禁點動作選單
        this.doms.actionMenu.style.pointerEvents = 'none';
        this.doms.actionMenu.style.opacity = '0';

        const qteCount = isSpecial ? 5 : 3;
        this.logMessage(`⚔️ 超人發動${isSpecial ? '必殺技：' + this.selectedHero.specialName : '普通攻擊'}！準備 QTE 連擊！`, 'hero');

        // 啟動 QTE (目標是怪獸)
        this.launchQTESequence('monster', qteCount, (results) => {
            // 計算總傷害與判定係數
            let scoreMultiplier = 0;
            let perfectCount = 0;

            results.forEach(res => {
                if (res === 'Perfect') {
                    scoreMultiplier += 1.8;
                    perfectCount++;
                }
                else if (res === 'Great') scoreMultiplier += 1.2;
                else if (res === 'Good') scoreMultiplier += 0.8;
                else scoreMultiplier += 0; // Miss
            });

            // 如果全部 Miss，攻擊落空
            if (scoreMultiplier === 0) {
                this.logMessage(`❌ 攻擊全部落空！怪獸完美躲過。`, 'miss-hit');
                this.startMonsterTurn();
                return;
            }

            // 計算最終傷害
            let baseAtk = this.selectedHero.atk;
            // 爆氣加成
            if (this.isDesperationMode) {
                baseAtk *= 1.5;
            }

            // 技能倍率
            const skillMultiplier = isSpecial ? 2.5 : 1.0;
            // 防禦減免
            const monsterDefFactor = Math.max(0.3, 1 - this.selectedMonster.def / 500);
            
            let totalDmg = baseAtk * scoreMultiplier * skillMultiplier * monsterDefFactor;

            // 難度傷害係數 (給玩家的挑戰)
            totalDmg *= DIFFICULTY_SETTINGS[this.difficulty].damageMultiplier;

            // 超人飛身一擊 / 發射光線動畫
            this.doms.heroFighter.classList.add('attack-anim');
            
            setTimeout(() => {
                this.doms.heroFighter.classList.remove('attack-anim');
                
                // 播受擊特效與怪獸震動
                audio.playHit();
                this.doms.monsterFighter.classList.add('hit-anim');
                this.flashScreen('white');

                // 獲取目前遊戲縮放比例
                const currentScale = getGameScale();

                // 獲取怪獸的中心位置並在此生成粒子與浮動傷害 (除以縮放比例以轉為 CSS 像素)
                const rect = this.doms.monsterFighter.getBoundingClientRect();
                const containerRect = this.doms.battleStage.getBoundingClientRect();
                const hitX = (rect.left - containerRect.left + rect.width / 2) / currentScale;
                const hitY = (rect.top - containerRect.top + rect.height / 2) / currentScale;

                if (isSpecial) {
                    // 必殺技雷射！ (除以縮放比例以轉為 CSS 像素)
                    const heroRect = this.doms.heroFighter.getBoundingClientRect();
                    const heroX = (heroRect.left - containerRect.left + heroRect.width / 2) / currentScale;
                    const heroY = (heroRect.top - containerRect.top + heroRect.height / 3) / currentScale; // 經典斯派修姆光線從手部發射
                    
                    audio.playLaser(1.2);
                    this.canvasManager.addLaserBeam(heroX, heroY, hitX, hitY, '#00f3ff');
                    this.canvasManager.addHitParticles(hitX, hitY, '#00f3ff', 40);
                } else {
                    this.canvasManager.addHitParticles(hitX, hitY, '#ffd700', 20);
                }

                // 傷害顯示
                const isCrit = perfectCount === qteCount; // 全 Perfect 為暴擊
                this.showFloatingDamage(totalDmg, hitX, hitY - 40, isCrit);

                // 更新怪獸生命值與蓄氣
                this.monsterHp = Math.max(0, this.monsterHp - totalDmg);
                
                // 增加超人能量 (普通攻擊才會加，必殺技消耗全部能量)
                if (isSpecial) {
                    this.heroEnergy = 0;
                } else {
                    // 判定越好加能量越多
                    const energyGain = Math.round(scoreMultiplier * 10);
                    this.heroEnergy = Math.min(100, this.heroEnergy + energyGain);
                }

                // 怪獸怒氣上升
                this.monsterRage = Math.min(100, this.monsterRage + Math.round(totalDmg / 8));

                this.updateHud();

                const logType = isCrit ? 'perfect-hit' : 'hero';
                this.logMessage(`💥 超人造成了 ${Math.round(totalDmg)} 點傷害！ (判定：${results.join('/')})${isCrit ? ' 【極限超擊！】' : ''}`, logType);

                setTimeout(() => {
                    this.doms.monsterFighter.classList.remove('hit-anim');
                    
                    // 檢查勝負
                    if (this.monsterHp <= 0) {
                        this.endGame(true);
                    } else {
                        this.startMonsterTurn();
                    }
                }, 400);

            }, 250);
        });
    }

    executeMonsterAttack() {
        if (this.isGameOver) return;

        // 怪獸怒氣滿發動暴虐一擊
        const isEnraged = this.monsterRage >= 100;
        const damageMultiplier = isEnraged ? 2.0 : 1.0;
        
        this.logMessage(`🚨 怪獸咆哮！發動 ${isEnraged ? '【暴虐重擊】' : '普通進攻'}！請即時格擋！`, 'monster');
        
        // 防禦 QTE 點個數
        const qteCount = isEnraged ? 3 : 2;

        // 啟動 QTE (目標是超人)
        this.launchQTESequence('hero', qteCount, (results) => {
            // 計算格擋等級
            let perfectCount = 0;
            let greatCount = 0;
            let goodCount = 0;
            let missCount = 0;

            results.forEach(res => {
                if (res === 'Perfect') perfectCount++;
                else if (res === 'Great') greatCount++;
                else if (res === 'Good') goodCount++;
                else missCount++;
            });

            // 傷害減免比率
            // Perfect: 100% 減免； Great: 80% 減免； Good: 50% 減免； Miss: 0% 減免
            let blockFactor = (perfectCount * 1.0 + greatCount * 0.8 + goodCount * 0.5) / qteCount;
            
            // 計算傷害
            const monsterAtk = this.selectedMonster.atk * damageMultiplier;
            const heroDefFactor = Math.max(0.4, 1 - this.selectedHero.def / 400);
            let rawDamage = monsterAtk * heroDefFactor;
            
            // 難度係數加成 (怪獸對超人的傷害)
            const difficultyData = DIFFICULTY_SETTINGS[this.difficulty];
            rawDamage *= difficultyData.damageMultiplier;

            // 最終傷害
            const finalDamage = rawDamage * (1 - blockFactor);
            this.totalDamageTaken += finalDamage;

            // 怪獸前衝攻擊動畫
            this.doms.monsterFighter.classList.add('attack-anim');

            setTimeout(() => {
                this.doms.monsterFighter.classList.remove('attack-anim');

                // 播特效與超人受擊
                audio.playHit();
                this.doms.heroFighter.classList.add('hit-anim');
                this.flashScreen('red');

                // 獲取目前遊戲縮放比例
                const currentScale = getGameScale();

                const rect = this.doms.heroFighter.getBoundingClientRect();
                const containerRect = this.doms.battleStage.getBoundingClientRect();
                const hitX = (rect.left - containerRect.left + rect.width / 2) / currentScale;
                const hitY = (rect.top - containerRect.top + rect.height / 2) / currentScale;

                // 防禦特效與粒子
                if (blockFactor >= 0.8) {
                    // 完美護盾粒子 (青色/金色)
                    this.canvasManager.addQTEBurst(hitX, hitY, '#00ff87');
                    this.logMessage(`🛡️ 完美格擋！超人建起光能護盾！`, 'perfect-hit');
                    
                    // Perfect 特權：反射 15% 傷害給怪獸！
                    if (perfectCount === qteCount) {
                        const reflectedDmg = Math.round(rawDamage * 0.15);
                        this.monsterHp = Math.max(0, this.monsterHp - reflectedDmg);
                        this.logMessage(`✨ 光能反彈！對怪獸造成 ${reflectedDmg} 點反震傷害！`, 'perfect-hit');
                        
                        // 繪製反射粒子 (除以縮放比例以轉為 CSS 像素)
                        const monsterRect = this.doms.monsterFighter.getBoundingClientRect();
                        const monsterX = (monsterRect.left - containerRect.left + monsterRect.width / 2) / currentScale;
                        const monsterY = (monsterRect.top - containerRect.top + monsterRect.height / 2) / currentScale;
                        this.canvasManager.addLaserBeam(hitX, hitY, monsterX, monsterY, '#00f3ff');
                        this.showFloatingDamage(reflectedDmg, monsterX, monsterY - 40, false);
                    }
                } else {
                    // 濺落火花粒子
                    this.canvasManager.addHitParticles(hitX, hitY, '#ff2e54', 25);
                }

                // 扣血與更新
                this.heroHp = Math.max(0, this.heroHp - finalDamage);
                
                if (finalDamage > 0) {
                    this.showFloatingDamage(finalDamage, hitX, hitY - 40, false);
                    this.logMessage(`💥 超人受到 ${Math.round(finalDamage)} 點傷害！ (判定：${results.join('/')})`, 'miss-hit');
                } else {
                    this.logMessage(`🛡️ 超人無傷化解攻勢！`, 'perfect-hit');
                }

                // 清空怪獸怒氣 (如果是暴怒一擊)
                if (isEnraged) {
                    this.monsterRage = 0;
                } else {
                    // 否則普通攻擊增加 15 點怒氣
                    this.monsterRage = Math.min(100, this.monsterRage + 15);
                }

                this.updateHud();

                setTimeout(() => {
                    this.doms.heroFighter.classList.remove('hit-anim');

                    // 檢查勝負
                    if (this.heroHp <= 0) {
                        this.endGame(false);
                    } else {
                        this.startHeroTurn();
                    }
                }, 400);

            }, 250);
        });
    }

    // ==========================================
    // 8. 結算與評分
    // ==========================================
    endGame(isVictory) {
        this.isGameOver = true;
        audio.stopColorTimerSound();

        // 停止 QTE 動畫環
        cancelAnimationFrame(this.qteAnimationFrame);
        this.doms.qteOverlay.innerHTML = '';

        // 播音樂
        if (isVictory) {
            audio.playVictoryMelody();
        } else {
            audio.playDefeatMelody();
        }

        // 結算畫面設定
        const titleEl = document.getElementById('result-title');
        if (isVictory) {
            titleEl.innerText = 'VICTORY';
            titleEl.className = 'result-title victory';
            this.logMessage(`🏆 戰鬥結束：奧特超人守護了地球，獲得勝利！`, 'perfect-hit');
        } else {
            titleEl.innerText = 'DEFEAT';
            titleEl.className = 'result-title defeat';
            this.logMessage(`💀 戰鬥結束：超人能量耗盡，怪獸摧毀了都市...`, 'miss-hit');
        }

        // 計算綜合戰力評級
        // 評分算法：賸餘 HP + Perfect次數*50 + maxCombo*30 - 受到傷害*0.5
        let score = (this.heroHp) + (this.totalPerfects * 60) + (this.maxCombo * 40) - (this.totalDamageTaken * 0.4);
        if (!isVictory) score = score * 0.4; // 失敗懲罰

        let rating = 'D';
        if (score >= 1200) rating = 'S';
        else if (score >= 800) rating = 'A';
        else if (score >= 500) rating = 'B';
        else if (score >= 200) rating = 'C';

        // 填入數值
        document.getElementById('result-combo').innerText = this.maxCombo;
        document.getElementById('result-perfect').innerText = this.totalPerfects;
        document.getElementById('result-damage').innerText = Math.round(this.totalDamageTaken);
        document.getElementById('result-hp').innerText = `${Math.round(this.heroHp)} / ${this.heroMaxHp}`;
        document.getElementById('result-rating').innerText = rating;

        // 切換面板
        setTimeout(() => {
            this.switchScreen('result');
        }, 1500);
    }
}

// ==========================================
// 9. 啟動遊戲與自適應等比縮放
// ==========================================
function resizeGame() {
    const container = document.getElementById('game-container');
    if (!container) return;

    const targetW = 1024;
    const targetH = 768;
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;

    // 計算最佳貼合比例
    const scaleX = windowW / targetW;
    const scaleY = windowH / targetH;
    const scale = Math.min(scaleX, scaleY);

    // 套用 CSS transform 以實現完美等比縮放與置中
    container.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

window.addEventListener('DOMContentLoaded', () => {
    window.gameEngine = new GameEngine();

    // 初始化與監聽視窗變動，實現響應式自適應縮放
    resizeGame();
    window.addEventListener('resize', resizeGame);

    // 行動端直向螢幕提示檢測
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    // 針對 iOS Safari 及行動端觸控設備的全域音訊一次性解鎖機制
    const unlockAudio = () => {
        audio.init();
        // 如果 AudioContext 成功運行，則移除監聽以釋放記憶體
        if (audio.ctx && audio.ctx.state === 'running') {
            document.removeEventListener('pointerdown', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        }
    };
    // 綁定 pointerdown 與 touchstart，確保使用者在觸碰任何地方時第一時間解鎖音效
    document.addEventListener('pointerdown', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
});
