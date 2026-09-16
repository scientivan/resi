# Harness — jalankan begitu kredensial ada

Urutan wajib. Jangan lompat; Eksperimen 0 menentukan bentuk proyeknya.

```bash
cp .env.example .env    # isi dari SETUP-CREDENTIALS.md
npm install
npm run exp0            # 1 transaksi, menentukan nasib M3
npm run proxy           # terminal terpisah: proxy RPC injeksi
npm run campaign        # kampanye M1, tulis receipts.json
npm run survey          # hitung ulang 35/37, tulis survey.json
```

## Isi

| Berkas | Guna |
|---|---|
| `scripts/exp0-revert.ts` | Apakah CDP menyiarkan transaksi yang pasti revert? |
| `scripts/rpc-proxy.ts` | Proxy Base Sepolia, menolak `eth_getTransactionReceipt` sesuai saklar |
| `scripts/campaign.ts` | Jalankan lengan A/B/C × N percobaan, catat semua hash |
| `scripts/survey-preflight.ts` | Survei 37 fungsi, terbitkan angkanya |
| `scripts/verify-receipts.sh` | Satu perintah untuk juri memverifikasi tiap hash |
