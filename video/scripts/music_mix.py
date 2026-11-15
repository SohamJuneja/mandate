# Original generated music (pad + plucked arpeggio + soft bass, 96 BPM) and the final mix with ducking.
import json, wave, os, sys
import numpy as np
SR = 48000
TL = json.load(open("src/timeline.json"))
FPS = TL["fps"]; TOTAL = TL["total"] / FPS
N = int(TOTAL * SR) + SR
t = np.arange(N) / SR
rng = np.random.default_rng(7)
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
BPM = 96; beat = 60 / BPM; bar = 4 * beat
# Dmaj9 – Bm7 – Gmaj7 – A(add9): warm, uplifting
CH = [[50, 57, 61, 64, 66], [47, 54, 57, 62, 66], [43, 50, 54, 59, 62], [45, 52, 57, 61, 64]]
music = np.zeros(N)
# pad: detuned saw-ish (few harmonics), slow attack per bar, one-pole lowpass
def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); acc = 0.0
    # vectorised via lfilter-free approach: chunked recursion
    from itertools import accumulate
    out = np.empty_like(x); prev = 0.0
    for i in range(0, len(x), 4096):
        seg = x[i:i+4096]; o = np.empty_like(seg)
        for j, v in enumerate(seg): prev = (1 - a) * v + a * prev; o[j] = prev
        out[i:i+4096] = o
    return out
nbars = int(TOTAL / bar) + 2
pad = np.zeros(N)
for b in range(nbars):
    c = CH[b % 4]; s0 = int(b * bar * SR); s1 = min(N, int((b + 1) * bar * SR + 0.6 * SR))
    if s0 >= N: break
    tt = t[s0:s1] - b * bar
    env = np.minimum(1, tt / 0.9) * np.minimum(1, np.maximum(0, (bar + 0.6 - tt) / 0.9))
    seg = np.zeros(s1 - s0)
    for m in c:
        f = midi(m + 12 * (m < 52))
        for det in (-0.12, 0.0, 0.11):
            ff = f * 2 ** (det / 12)
            ph = rng.uniform(0, 2 * np.pi)
            for h, amp in ((1, 1.0), (2, 0.35), (3, 0.15)):
                seg += amp * np.sin(2 * np.pi * ff * h * tt + ph * h)
    pad[s0:s1] += seg * env / 30
cs = np.cumsum(np.insert(pad, 0, 0.0)); pad = np.concatenate([(cs[24:] - cs[:-24]) / 24, np.zeros(23)])  # soften highs
# plucked arpeggio: eighth notes over chord tones, exp decay
arp = np.zeros(N); step = beat / 2
pattern = [0, 2, 3, 4, 3, 2, 1, 2]
for k in range(int(TOTAL / step) + 1):
    b = int(k * step / bar); c = CH[b % 4]; m = c[pattern[k % 8]] + 12
    s0 = int(k * step * SR); L = int(0.9 * SR)
    if s0 >= N: break
    tt = np.arange(min(L, N - s0)) / SR
    f = midi(m)
    note = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt) * np.exp(-tt * 9)) * np.exp(-tt * 4.5) * np.minimum(1, tt / 0.004)
    arp[s0:s0 + len(tt)] += note * (0.55 if k % 2 else 0.75)
# soft bass on beats 1 and 3
bass = np.zeros(N)
for k in range(int(TOTAL / (2 * beat)) + 1):
    b = int(k * 2 * beat / bar); m = CH[b % 4][0] - 12
    s0 = int(k * 2 * beat * SR); L = int(1.2 * SR)
    if s0 >= N: break
    tt = np.arange(min(L, N - s0)) / SR
    bass[s0:s0 + len(tt)] += np.sin(2 * np.pi * midi(m) * tt) * np.exp(-tt * 2.2) * np.minimum(1, tt / 0.01)
music = pad * 1.0 + arp * 0.16 + bass * 0.22
# simple stereo: arp slightly wider via delay
L = music.copy(); R = music.copy()
d = int(0.012 * SR); R[d:] = 0.7 * R[d:] + 0.3 * arp[:-d] * 0.16
mus = np.stack([L, R], 1)
# custom music override
if os.path.exists("assets/music.mp3"):
    import subprocess
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-stream_loop", "-1", "-i", "assets/music.mp3", "-t", str(N / SR), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    mus = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)[:N]
    if len(mus) < N: mus = np.pad(mus, ((0, N - len(mus)), (0, 0)))
def rms_db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
mus /= 10 ** (rms_db(mus) / 20)              # music to 0 dB RMS reference
# voice track
voice = np.zeros(N); active = np.zeros(N, bool)
for s in TL["scenes"]:
    with wave.open(f"public/vo/{s['id']}.wav") as w:
        sr = w.getframerate(); v = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    v = np.interp(np.arange(int(len(v) * SR / sr)) / SR, np.arange(len(v)) / sr, v)
    f = int(0.006 * SR); v[:f] *= np.linspace(0, 1, f); v[-f:] *= np.linspace(1, 0, f)
    s0 = int(s["voStart"] / FPS * SR); e = min(N, s0 + len(v))
    voice[s0:e] += v[:e - s0]
    # active where actual speech energy (sentence gaps let the music breathe a little, smoothed below)
    active[s0:e] = True
sp = voice[active]
voice *= 10 ** ((-18 - rms_db(sp[np.abs(sp) > 0.003])) / 20)   # speech ≈ -18 dBFS RMS
# gain envelope: -26 dB RMS under voice (≈ 8 dB below speech), -20 free; 0.35 s smoothing
g = np.where(active, -27.0, -20.5)
k = int(0.35 * SR); gp = np.pad(g, (k, k), mode="edge"); cs = np.cumsum(np.insert(gp, 0, 0.0)); g = ((cs[2 * k:] - cs[:-2 * k]) / (2 * k))[:N]
gain = 10 ** (g / 20)
# fades: 1.5 s in, 2.5 s out
fi = int(1.5 * SR); gain[:fi] *= np.linspace(0, 1, fi)
end = int(TOTAL * SR); fo = int(2.5 * SR); gain[end - fo:end] *= np.linspace(1, 0, fo); gain[end:] = 0
mix = mus * gain[:, None] + voice[:, None]
mix = mix[:end]
peak = np.max(np.abs(mix)); 
if peak > 0.97: mix *= 0.97 / peak
print("speech rms", round(rms_db(voice[active]), 1), "music under voice", round(rms_db((mus * gain[:, None])[:end][active[:end]]), 1), "music free", round(rms_db((mus * gain[:, None])[:end][~active[:end] & (gain[:end] > 0.05)]), 1), "peak", round(float(peak), 3))
with wave.open("out/mix.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
print("wrote out/mix.wav", round(len(mix) / SR, 2), "s")
