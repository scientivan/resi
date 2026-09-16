#!/usr/bin/env python3
"""
Survei pra-terbang: berapa banyak agent action AgentKit yang menyiarkan
transaksi TANPA menyimulasikannya lebih dulu?

Dijalankan terhadap paket TERPASANG (dist), bukan GitHub main. Keduanya berbeda
secara material (nama field skema, satuan amount, opsi rpcUrl, pra-pemeriksaan).

  python3 scripts/survey-preflight.py
"""
import re, os, glob, json, sys

ROOT = "node_modules/@coinbase/agentkit/dist/action-providers"
SIM  = re.compile(r'simulateContract|estimateGas|staticCall|callStatic', re.I)
PRE  = re.compile(r'balanceOf|getBalance|allowance|ownerOf|getOwner|insufficient|maxWithdraw|previewRedeem', re.I)
SEND = re.compile(r'sendTransaction|sendUserOperation|gaslessERC20Transfer|nativeTransfer|signAndSendTransaction')

# Aksi yang menyiarkan lewat helper di BERKAS LAIN, jadi tidak tertangkap
# pemindaian per-badan-fungsi. Diverifikasi manual.
CROSS_FILE = [
    # vaultsfyi: deposit/redeem/claim -> utils.executeActions() -> wallet.sendTransaction()
    #            dalam loop, tanpa simulasi, tanpa pra-cek, dan TIDAK PERNAH
    #            mengembalikan hash bahkan saat sukses ("Deposit successful").
    {"provider": "vaultsfyi", "fn": "deposit", "sim": False, "pre": False, "via": "utils.executeActions"},
    {"provider": "vaultsfyi", "fn": "redeem",  "sim": False, "pre": False, "via": "utils.executeActions"},
    {"provider": "vaultsfyi", "fn": "claim",   "sim": False, "pre": False, "via": "utils.executeActions"},
]

def methods(src):
    out = []
    for m in re.finditer(r'^\s{2,8}(?:async\s+)?([A-Za-z_]\w*)\s*\([^)]*\)\s*\{', src, re.M):
        name = m.group(1)
        if name in ("constructor", "if", "for", "while", "switch", "catch", "function"):
            continue
        i = src.index('{', m.end() - 1)
        depth, j = 0, i
        while j < len(src):
            if src[j] == '{': depth += 1
            elif src[j] == '}':
                depth -= 1
                if depth == 0: break
            j += 1
        out.append((name, src[i:j+1]))
    return out

def main():
    if not os.path.isdir(ROOT):
        sys.exit(f"tidak ditemukan: {ROOT} (jalankan `npm install` dulu)")
    rows = []
    for f in sorted(glob.glob(f"{ROOT}/*/*.js")):
        if ".test." in f or f.endswith(("index.js", "schemas.js", "constants.js")):
            continue
        src = open(f, encoding="utf-8", errors="replace").read()
        prov, seen = os.path.basename(os.path.dirname(f)), set()
        for name, body in methods(src):
            if name in seen or not SEND.search(body):
                continue
            seen.add(name)
            rows.append({"provider": prov, "fn": name, "sim": bool(SIM.search(body)),
                         "pre": bool(PRE.search(body)), "lines": body.count("\n") + 1})
    rows.extend(CROSS_FILE)
    rows.sort(key=lambda r: (r["provider"], r["fn"]))

    ver = json.load(open("node_modules/@coinbase/agentkit/package.json"))["version"]
    n = len(rows)
    nosim = sum(1 for r in rows if not r["sim"])
    bare  = sum(1 for r in rows if not r["sim"] and not r["pre"])

    print(f"{'provider':16s} {'function':26s} {'sim':4s} {'pre':4s}")
    for r in rows:
        print(f"{r['provider']:16s} {r['fn']:26s} {str(r['sim'])[:1]:4s} {str(r['pre'])[:1]:4s}")
    print()
    print(f"@coinbase/agentkit {ver}")
    print(f"aksi yang menyiarkan transaksi : {n}")
    print(f"TANPA simulasi pra-terbang     : {nosim} dari {n}")
    print(f"tanpa simulasi DAN tanpa pra-cek: {bare} dari {n}")
    json.dump({"version": ver, "totals": {"sending": n, "noSimulation": nosim, "bare": bare},
               "rows": rows}, open("survey-dist.json", "w"), indent=1)
    print("\nditulis: survey-dist.json")

main()
