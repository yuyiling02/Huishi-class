#!/bin/zsh
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FALLBACK_ROOT="$(cd "$PROJECT_ROOT/../3d-agent-guide" 2>/dev/null && pwd || true)"
CONDA="${XIAOZHI_CONDA:-$PROJECT_ROOT/.tools/miniforge3/bin/conda}"
if [[ ! -x "$CONDA" && -n "$FALLBACK_ROOT" ]]; then
    CONDA="$FALLBACK_ROOT/.tools/miniforge3/bin/conda"
fi
GPT_SOVITS="$PROJECT_ROOT/services/GPT-SoVITS"
GPT_WEIGHTS="${XIAOZHI_GPT_WEIGHTS:-GPT_weights/Funina-e15.ckpt}"
SOVITS_WEIGHTS="${XIAOZHI_SOVITS_WEIGHTS:-SoVITS_weights/Funina_e8_s464.pth}"
GPT_PORT="${GPT_SOVITS_PORT:-9880}"
TTS_PORT="${ORBI_TTS_PORT:-8787}"
GPT_ORIGIN="http://127.0.0.1:$GPT_PORT"
TTS_ORIGIN="http://127.0.0.1:$TTS_PORT"
GPT_PID=""
GPT_SERVICE_PID=""
PROXY_PID=""

weight_path() {
    if [[ "$1" = /* ]]; then
        print -r -- "$1"
    else
        print -r -- "$GPT_SOVITS/$1"
    fi
}

if [[ ! -x "$CONDA" ]]; then
    print -u2 "GPT-SoVITS environment is missing. Set XIAOZHI_CONDA or install Miniforge under .tools."
    exit 1
fi

if [[ ! -f "$PROJECT_ROOT/services/voice/config.json" ]]; then
    print -u2 "小智·芙宁娜音色未配置。请检查 services/voice/config.json。"
    exit 1
fi

if [[ ! -d "$GPT_SOVITS" ]]; then
    print -u2 "GPT-SoVITS is missing. Install it under services/GPT-SoVITS."
    exit 1
fi

if [[ ! -f "$(weight_path "$GPT_WEIGHTS")" || ! -f "$(weight_path "$SOVITS_WEIGHTS")" ]]; then
    print -u2 "芙宁娜训练权重缺失：$GPT_WEIGHTS / $SOVITS_WEIGHTS"
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    print -u2 "curl is required to initialize and verify the Furina voice service."
    exit 1
fi

cleanup() {
    [[ -n "$GPT_PID" ]] && kill "$GPT_PID" 2>/dev/null || true
    [[ -n "$GPT_SERVICE_PID" ]] && kill "$GPT_SERVICE_PID" 2>/dev/null || true
    [[ -n "$PROXY_PID" ]] && kill "$PROXY_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' INT TERM

if curl -fsS --max-time 2 "$GPT_ORIGIN/docs" >/dev/null 2>&1; then
    print "检测到已运行的 GPT-SoVITS，直接复用 $GPT_ORIGIN。"
else
    cd "$GPT_SOVITS"
    "$CONDA" run -n GPTSoVits python api_v2.py \
        -a 127.0.0.1 \
        -p "$GPT_PORT" \
        -c GPT_SoVITS/configs/tts_infer.yaml &
    GPT_PID=$!

    print "正在启动 GPT-SoVITS 并加载芙宁娜训练权重……"
    for attempt in {1..120}; do
        if curl -fsS --max-time 2 "$GPT_ORIGIN/docs" >/dev/null 2>&1; then
            break
        fi
        if ! kill -0 "$GPT_PID" 2>/dev/null; then
            print -u2 "GPT-SoVITS 启动失败。"
            exit 1
        fi
        sleep 1
    done
fi

if ! curl -fsS --max-time 2 "$GPT_ORIGIN/docs" >/dev/null 2>&1; then
    print -u2 "GPT-SoVITS 启动超时。"
    exit 1
fi

if [[ -n "$GPT_PID" ]]; then
    GPT_SERVICE_PID="$(lsof -tiTCP:"$GPT_PORT" -sTCP:LISTEN 2>/dev/null | head -n 1)"
fi

curl -fsS -G --max-time 120 \
    --data-urlencode "weights_path=$GPT_WEIGHTS" \
    "$GPT_ORIGIN/set_gpt_weights" >/dev/null
curl -fsS -G --max-time 120 \
    --data-urlencode "weights_path=$SOVITS_WEIGHTS" \
    "$GPT_ORIGIN/set_sovits_weights" >/dev/null

if curl -fsS --max-time 2 "$TTS_ORIGIN/health" >/dev/null 2>&1; then
    print "检测到已运行的小智 TTS 代理，直接复用 $TTS_ORIGIN。"
else
    cd "$PROJECT_ROOT"
    GPT_SOVITS_URL="$GPT_ORIGIN/tts" ORBI_TTS_PORT="$TTS_PORT" python3 services/tts_proxy.py &
    PROXY_PID=$!

    for attempt in {1..30}; do
        if curl -fsS --max-time 2 "$TTS_ORIGIN/health" >/dev/null 2>&1; then
            break
        fi
        if ! kill -0 "$PROXY_PID" 2>/dev/null; then
            print -u2 "小智 TTS 代理启动失败。"
            exit 1
        fi
        sleep 1
    done
fi

if ! curl -fsS --max-time 2 "$TTS_ORIGIN/health" >/dev/null 2>&1; then
    print -u2 "小智 TTS 代理启动超时。"
    exit 1
fi

print "小智·芙宁娜 GPT-SoVITS 已就绪。"
while true; do
    if [[ -n "$GPT_PID" ]] && ! kill -0 "$GPT_PID" 2>/dev/null; then
        print -u2 "GPT-SoVITS 已意外退出。"
        exit 1
    fi
    if [[ -n "$PROXY_PID" ]] && ! kill -0 "$PROXY_PID" 2>/dev/null; then
        print -u2 "小智 TTS 代理已意外退出。"
        exit 1
    fi
    sleep 2
done
