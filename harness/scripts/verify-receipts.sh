#!/bin/bash
# One command for judges: check every hash in receipts.json against a public RPC.
# Usage: ./scripts/verify-receipts.sh receipts.json
RPC="${RPC:-https://sepolia.base.org}"
F="${1:-receipts.json}"
ok=0; bad=0; miss=0
for h in $(python3 -c "import json,sys;[print(r['hash']) for r in json.load(open('$F')) if r.get('hash')]"); do
  s=$(curl -s "$RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionReceipt\",\"params\":[\"$h\"]}" \
    | python3 -c "import sys,json;r=json.load(sys.stdin).get('result');print(r['status'] if r else 'null')")
  case "$s" in
    0x1) ok=$((ok+1));;
    0x0) bad=$((bad+1));;
    *)   miss=$((miss+1));;
  esac
done
echo "succeeded=$ok reverted=$bad not_found=$miss"
