#!/usr/bin/env bash
# ============================================================
# optimize-heart.sh
# 用 @gltf-transform/cli 压缩心脏模型
# 输入: public/models/心脏模型.glb (102 MB)
# 输出: public/models/heart-optimized.glb (目标 15-35 MB)
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

INPUT="$PROJECT_ROOT/public/models/心脏模型.glb"
OUTPUT="$PROJECT_ROOT/public/models/heart-optimized.glb"
TEMP="$PROJECT_ROOT/public/models/_heart-temp.glb"

if [ ! -f "$INPUT" ]; then
  echo "❌ 找不到输入文件: $INPUT"
  exit 1
fi

echo "📦 输入文件: $INPUT ($(du -h "$INPUT" | cut -f1))"
echo ""

# Step 1: 去重 (dedup 纹理、Accessor、材质)
echo "🔧 Step 1/4: 去重 (dedup)..."
npx --yes @gltf-transform/cli dedup "$INPUT" "$TEMP"

# Step 2: 清理无用节点
echo "🔧 Step 2/4: 清理无用节点 (prune)..."
npx --yes @gltf-transform/cli prune "$TEMP" "$TEMP"

# Step 3: 纹理降采样到 2048x2048
echo "🔧 Step 3/5: 纹理降采样到 2048x2048..."
npx --yes @gltf-transform/cli resize --width 2048 --height 2048 "$TEMP" "$TEMP"

# Step 4: 纹理转换为 WebP
echo "🔧 Step 4/5: 纹理转换为 WebP (quality 75)..."
npx --yes @gltf-transform/cli webp "$TEMP" "$TEMP" --quality 75

# Step 5: Draco 几何压缩
echo "🔧 Step 5/5: Draco 几何压缩..."
npx --yes @gltf-transform/cli draco "$TEMP" "$OUTPUT" \
  --method edgebreaker \
  --quantize-position 14 \
  --quantize-normal 10 \
  --quantize-texcoord 12 \
  --quantize-color 8

# 清理临时文件
rm -f "$TEMP"

echo ""
echo "✅ 压缩完成!"
echo "📦 输出文件: $OUTPUT"
echo ""
echo "📊 对比:"
echo "   原始: $INPUT"
echo "   优化: $OUTPUT"
