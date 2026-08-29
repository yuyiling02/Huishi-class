#!/usr/bin/env bash
set -euo pipefail

MODEL_NAME="sherpa-onnx-streaming-paraformer-bilingual-zh-en"
MODEL_URL="https://huggingface.co/csukuangfj/${MODEL_NAME}/resolve/main"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-${ASR_MODEL_DIR:-${ROOT_DIR}/models/asr/${MODEL_NAME}}}"

FILES=(
  "encoder.int8.onnx"
  "decoder.int8.onnx"
  "tokens.txt"
)

SHA256=(
  "81a70226a8934e6ed92aa1d4fc486b428b5398e2f2619ed4897b7294cab90e9a"
  "f3cca9f77bb9d93c8fcbfb63ae617b6b1ee96818df3aa3b151c40658fe38594f"
  "59aba8873a2ed1e122c25fee421e25f283b63290efbde85c1f01a853d83cb6e6"
)

if [[ "${TARGET_DIR}" == "/" || -z "${TARGET_DIR}" ]]; then
  echo "拒绝使用不安全的模型目录：${TARGET_DIR}" >&2
  exit 1
fi

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

mkdir -p "${TARGET_DIR}"

for index in "${!FILES[@]}"; do
  file="${FILES[$index]}"
  expected="${SHA256[$index]}"
  target="${TARGET_DIR}/${file}"

  if [[ -s "${target}" && "$(hash_file "${target}")" == "${expected}" ]]; then
    echo "已校验：${file}"
    continue
  fi

  temporary="${target}.download"
  rm -f "${temporary}"
  echo "正在下载 ${file}..."
  curl -fL --retry 3 --connect-timeout 15 -o "${temporary}" "${MODEL_URL}/${file}"

  actual="$(hash_file "${temporary}")"
  if [[ "${actual}" != "${expected}" ]]; then
    rm -f "${temporary}"
    echo "模型校验失败（${file}）：期望 ${expected}，实际 ${actual}" >&2
    exit 1
  fi
  mv "${temporary}" "${target}"
done

echo "ASR 模型安装完成：${TARGET_DIR}"
