#!/usr/bin/env bash
set -euo pipefail
# Fail if anything tracked by git looks like a REAL secret or real booking data.
# Load-bearing before any public push. Patterns match secret *values* (long,
# high-entropy tokens), not the identifier "cookie" used as a variable/property.
cd "$(git rev-parse --show-toplevel)"

fail=0
note() { echo "$1"; fail=1; }

# 1. Private keys.
if git grep -nIE -- '-----BEGIN [A-Z ]*PRIVATE KEY' ':!scripts/secret-sweep.sh' >/tmp/ncl-s1.txt 2>/dev/null; then
  echo "Private key material in tracked files:"; cat /tmp/ncl-s1.txt; fail=1
fi

# 2. JWT-shaped tokens.
if git grep -nIE -- 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}' ':!scripts/secret-sweep.sh' >/tmp/ncl-s2.txt 2>/dev/null; then
  echo "JWT-shaped token in tracked files:"; cat /tmp/ncl-s2.txt; fail=1
fi

# 3. A cookie/authorization assigned a long (40+ char) opaque value — a real
#    session token, as opposed to a short fake like cookie: "abc".
if git grep -nIE -- '(cookie|authorization|token)["'"'"' ]*[:=] ?["'"'"'][^"'"'"' ]{40,}' ':!scripts/secret-sweep.sh' >/tmp/ncl-s3.txt 2>/dev/null; then
  echo "Long secret-like value in tracked files:"; cat /tmp/ncl-s3.txt; fail=1
fi

# 4. A long run of digits that looks like a real reservation/voyage id sitting
#    in source (fixtures use short obvious fakes like 99999999 / 88888888).
if git grep -nIE -- '\b[0-9]{9,}\b' -- 'src/**' 'docs/**' 'README.md' >/tmp/ncl-s4.txt 2>/dev/null; then
  echo "Long numeric id in tracked source/docs (use a fixture placeholder):"; cat /tmp/ncl-s4.txt; fail=1
fi

# 5. No config, HARs, or raw captures tracked.
if git ls-files | grep -E '(^|/)config\.json$|\.har$|(^|/)real-.*\.json$|ncl-capture'; then
  echo "Refusing: a config/HAR/raw-capture file is tracked."; fail=1
fi

# 6. The private workspace must never be tracked (real cruise data lives there).
if git ls-files | grep -E '^\.local/'; then
  echo "Refusing: a file under .local/ (private workspace) is tracked."; fail=1
fi

if [ "$fail" -ne 0 ]; then echo "secret-sweep: FAILED"; exit 1; fi
echo "secret-sweep: clean"
