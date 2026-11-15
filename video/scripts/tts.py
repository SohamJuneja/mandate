import asyncio, json, re, subprocess, sys, os, wave, struct
import edge_tts
VOICE = sys.argv[1] if len(sys.argv) > 1 else "en-US-AndrewMultilingualNeural"
SCENES = {
 "s01": "This bounty produced dozens of trading bots. Almost every one of them trades only its builder's own money.",
 "s02": "Because trusting an AI agent with your money means one of two things. Hand over your keys. Or trust a promise. And agents hallucinate. They loop. They get prompt-injected.",
 "s03": "So we built Mandate. Vaults where AI agents trade your money on dreamDEX perps, inside rules the contract enforces.",
 "s04": "Every vault has a mandate, written into the contract. Which markets. How much leverage. How big. And when to stop. The leader can trade your money. It can never withdraw it.",
 "s05": "This is live on Somnia's Tokyo testnet. Depositors get shares at live NAV, read straight from the vault's own dreamDEX margin account.",
 "s06": "Every order goes through one function. The market, the size, and the worst-case leverage are checked at mark, before anything touches the order book.",
 "s07": "Here, the leader tries to trade SOL. It's not in the mandate. Reverted, on chain. And here, thirty-two dollars against a twenty-five dollar cap. Refused.",
 "s08": "The leader in our live run was an AI agent. Three times it asked for too much. Three times the vault said no. It sized down, and kept trading. Eight real orders, all through the vault.",
 "s09": "And when a vault breaks its drawdown limit, Somnia Reactivity calls our guard, in the same block. Reduce-only. Position closed. No keeper. No bot. The leader's next buy? Reverted.",
 "s11": "Leaders earn a fee on new highs. The app earns a builder fee on every order. And we'll be on dreamDEX mainnet the day perps launch. Mandate. Let agents trade, inside the lines.",
}
SR = 24000
GAP = 0.35
OUT = "public/vo"
def split(t): return [s for s in re.split(r'(?<=[.?!])\s+', t) if s]
async def sentence(text, path):
    for a in range(8):
        try: return await _sentence(text, path)
        except Exception as e:
            print("  sentence retry", a, str(e)[:40]); await asyncio.sleep(1.5)
    raise RuntimeError("tts failed: " + text)
async def _sentence(text, path):
    c = edge_tts.Communicate(text, VOICE, rate="-4%", boundary="WordBoundary")
    words = []
    with open(path + ".mp3", "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio": f.write(ch["data"])
            elif ch["type"] == "WordBoundary": words.append({"t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7, "w": ch["text"]})
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path + ".mp3", "-ac", "1", "-ar", str(SR), "-f", "s16le", path + ".raw"], check=True)
    pcm = open(path + ".raw", "rb").read(); os.remove(path + ".raw"); os.remove(path + ".mp3")
    return pcm, words
async def scene(k, text):
    pcm_all = b""; words_all = []; t = 0.0
    for i, s in enumerate(split(text)):
        pcm, words = await sentence(s, f"{OUT}/{k}_{i}")
        # trim trailing silence a bit is unnecessary; keep as is
        for w in words: words_all.append({"t": round(t + w["t"], 3), "d": round(w["d"], 3), "w": w["w"]})
        pcm_all += pcm; t += len(pcm) / 2 / SR
        pcm_all += b"\x00\x00" * int(GAP * SR); t += GAP
    with wave.open(f"{OUT}/{k}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm_all)
    return k, {"dur": round(t - GAP, 3), "words": words_all}
async def main():
    res = json.load(open("src/vo.json")) if os.path.exists("src/vo.json") else {}
    for k, v in SCENES.items():
        if k in res and os.path.exists(f"{OUT}/{k}.wav"): continue
        for attempt in range(3):
            try:
                kk, r = await scene(k, v); res[kk] = r; print(k, r["dur"], len(r["words"])); break
            except Exception as e: print("retry", k, e)
        json.dump(res, open("src/vo.json", "w"), indent=1)
    json.dump(res, open("src/vo.json", "w"), indent=1)
asyncio.run(main())
