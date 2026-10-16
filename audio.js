(function () {
const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;

let context = null;
let master = null;
let enabled = true;
let lastPlayed = new Map();
const pendingSounds = [];
let resumeRequest = null;
let lastResumeError = '';

function notifyAudioState() {
  window.dispatchEvent(new Event('forest-audio-statechange'));
}

function flushPendingSounds() {
  if (!context || context.state !== 'running' || !enabled) return;
  while (pendingSounds.length) playSoundNow(pendingSounds.shift());
  notifyAudioState();
}

// 効果音は毎回ONで起動する（ON/OFFの設定は保存しない）。

function isAudioEnabled() {
  return enabled;
}

function setAudioEnabled(value) {
  enabled = Boolean(value);
  if (!enabled) pendingSounds.length = 0;
  if (master && context) {
    master.gain.setTargetAtTime(enabled ? 0.68 : 0, context.currentTime, 0.025);
  }
  notifyAudioState();
}

function initializeAudio(userGesture = false) {
  if (!enabled || !AudioContextClass) return;
  // Create/unlock Web Audio only during a real user gesture. Title-screen demo
  // sounds must not consume the browser's autoplay permission before play.
  if (!context && !userGesture) return;
  if (!context) {
    try {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.68;
      master.connect(context.destination);
      context.addEventListener?.('statechange', flushPendingSounds);
      notifyAudioState();
    } catch {
      context = null;
      master = null;
      return;
    }
  }
  if (context.state === 'closed') {
    context = null;
    master = null;
    if (!userGesture) return;
    initializeAudio(userGesture);
    return;
  }
  if (context.state !== 'running' && userGesture) {
    try {
      // 以前の resume() が保留のままでも、新しい操作のたびに必ず再試行する。
      // ユーザー操作なしで呼ばれた resume() は解決されないことがあり、
      // それを待ち続けると、その後の本当のクリックまで無視してしまうため。
      const activeContext = context;
      const resume = activeContext.resume();
      resumeRequest = resume;
      resume
        .then(() => {
          lastResumeError = '';
          if (context === activeContext) {
            flushPendingSounds();
            playSoundNow('select');
          }
          notifyAudioState();
        })
        .catch((error) => {
          lastResumeError = error?.message || String(error);
          notifyAudioState();
        })
        .finally(() => {
          if (resumeRequest === resume) resumeRequest = null;
          notifyAudioState();
        });
    } catch {
      lastResumeError = 'AudioContext resume failed';
      resumeRequest = null;
      notifyAudioState();
    }
  } else {
    flushPendingSounds();
  }
}

const SOUNDS = {
  attack: { notes: [[540, 0.045, 'triangle', 0.045], [810, 0.055, 'sine', 0.025]], cooldown: 55 },
  hit: { notes: [[210, 0.07, 'square', 0.035]], cooldown: 55 },
  kill: { notes: [[180, 0.07, 'triangle', 0.075], [360, 0.12, 'sine', 0.055]], cooldown: 45 },
  xp: { notes: [[740, 0.055, 'sine', 0.04], [990, 0.085, 'sine', 0.035]], cooldown: 45 },
  hurt: { notes: [[125, 0.16, 'sawtooth', 0.09], [85, 0.18, 'triangle', 0.06]], cooldown: 200 },
  select: { notes: [[440, 0.06, 'triangle', 0.045], [660, 0.075, 'sine', 0.035]], cooldown: 80 },
  explode: { notes: [[95, 0.2, 'sawtooth', 0.12], [62, 0.24, 'triangle', 0.08]], cooldown: 100 },
  levelup: { notes: [[523, 0.13, 'sine', 0.075], [659, 0.13, 'sine', 0.07], [784, 0.2, 'sine', 0.085]], cooldown: 180 },
  wave: { notes: [[330, 0.12, 'triangle', 0.065], [494, 0.16, 'sine', 0.075], [659, 0.2, 'sine', 0.085]], cooldown: 250 },
  boss: { notes: [[146, 0.2, 'sawtooth', 0.12], [220, 0.25, 'triangle', 0.1], [110, 0.36, 'sine', 0.12]], cooldown: 500 },
  armor: { notes: [[165, 0.095, 'square', 0.055], [115, 0.13, 'triangle', 0.065]], cooldown: 75 },
  heal: { notes: [[523, 0.11, 'sine', 0.07], [784, 0.13, 'sine', 0.075], [1047, 0.19, 'sine', 0.08]], cooldown: 180 },
};

function playSound(name) {
  if (!enabled) return;
  const sound = SOUNDS[name];
  if (!sound) return;

  if (!context) return;
  if (context.state !== 'running') {
    if (pendingSounds.length < 12) pendingSounds.push(name);
    return;
  }

  playSoundNow(name);
}

function playSoundNow(name) {
  if (!enabled || !context || context.state !== 'running') return;
  const sound = SOUNDS[name];
  if (!sound) return;

  const now = context.currentTime;
  const previous = lastPlayed.get(name);
  if (previous !== undefined && now - previous < sound.cooldown / 1000) return;
  lastPlayed.set(name, now);

  for (const [frequency, duration, wave, volume] of sound.notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (name === 'kill' || name === 'hurt' || name === 'explode') {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * 0.55), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.28, volume * 1.8), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.015);
  }
}

function getAudioStatus() {
  return {
    enabled,
    available: Boolean(AudioContextClass),
    state: context?.state || 'not-initialized',
    pending: pendingSounds.length,
    resumePending: Boolean(resumeRequest),
    error: lastResumeError,
  };
}

window.ForestAudio = { getAudioStatus, initializeAudio, isAudioEnabled, playSound, setAudioEnabled };
})();