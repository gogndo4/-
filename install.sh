#!/usr/bin/env bash
# Daily Condition Tracker - Obsidian Plugin Installer

set -e
PLUGIN_ID="daily-condition-tracker"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "  Daily Condition Tracker 설치"
echo "  =============================="
echo ""

# ─── Obsidian 볼트 자동 탐색 ───
find_vaults() {
  local vaults=()

  # macOS: Obsidian 설정 파일에서 볼트 목록 읽기
  local cfg_mac="$HOME/Library/Application Support/obsidian/obsidian.json"
  # Linux
  local cfg_linux="$HOME/.config/obsidian/obsidian.json"

  for cfg in "$cfg_mac" "$cfg_linux"; do
    if [[ -f "$cfg" ]] && command -v python3 &>/dev/null; then
      while IFS= read -r path; do
        [[ -n "$path" && -d "$path" ]] && vaults+=("$path")
      done < <(python3 - "$cfg" <<'PY'
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
    for v in data.get("vaults", {}).values():
        p = v.get("path", "")
        if p:
            print(p)
except Exception:
    pass
PY
)
    fi
  done

  # 폴백: .obsidian 폴더 직접 탐색
  if [[ ${#vaults[@]} -eq 0 ]]; then
    for base in "$HOME/Documents" "$HOME/Desktop" "$HOME/Obsidian" "$HOME"; do
      [[ -d "$base" ]] || continue
      while IFS= read -r obs; do
        local vault="${obs%/.obsidian}"
        [[ -d "$vault" ]] && vaults+=("$vault")
      done < <(find "$base" -maxdepth 4 -name ".obsidian" -type d 2>/dev/null | head -20)
    done
  fi

  # 중복 제거
  local seen=()
  for v in "${vaults[@]}"; do
    local dup=0
    for s in "${seen[@]}"; do [[ "$s" == "$v" ]] && dup=1 && break; done
    [[ $dup -eq 0 ]] && seen+=("$v")
  done
  printf '%s\n' "${seen[@]}"
}

mapfile -t VAULTS < <(find_vaults)

# ─── 볼트 선택 ───
if [[ ${#VAULTS[@]} -eq 0 ]]; then
  echo "  Obsidian 볼트를 자동으로 찾지 못했어요."
  echo -n "  볼트 폴더 경로를 직접 입력하세요: "
  read -r VAULT_PATH
elif [[ ${#VAULTS[@]} -eq 1 ]]; then
  VAULT_PATH="${VAULTS[0]}"
  echo "  발견된 볼트: $VAULT_PATH"
  echo ""
else
  echo "  발견된 Obsidian 볼트:"
  for i in "${!VAULTS[@]}"; do
    echo "    $((i+1)). ${VAULTS[$i]}"
  done
  echo ""
  echo -n "  설치할 볼트 번호를 입력하세요 [1]: "
  read -r choice
  choice="${choice:-1}"
  VAULT_PATH="${VAULTS[$((choice-1))]}"
fi

if [[ ! -d "$VAULT_PATH" ]]; then
  echo "  오류: 폴더가 존재하지 않아요 → $VAULT_PATH"
  exit 1
fi

# ─── 플러그인 파일 복사 ───
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"
mkdir -p "$PLUGIN_DIR"
cp "$DIR/main.js"      "$PLUGIN_DIR/"
cp "$DIR/manifest.json" "$PLUGIN_DIR/"
cp "$DIR/styles.css"   "$PLUGIN_DIR/"

echo ""
echo "  설치 완료!"
echo "  경로: $PLUGIN_DIR"
echo ""
echo "  ─────────────────────────────────────────"
echo "  마지막 단계 (딱 하나만 하면 돼요):"
echo ""
echo "  1. Obsidian 열기"
echo "  2. 설정(⚙️) → 커뮤니티 플러그인"
echo "  3. 'Daily Condition Tracker' 활성화 토글 ON"
echo ""
echo "  그러면 왼쪽 리본에 📊 아이콘이 생겨요."
echo "  클릭하면 자동으로 분석이 시작됩니다!"
echo "  ─────────────────────────────────────────"
echo ""
