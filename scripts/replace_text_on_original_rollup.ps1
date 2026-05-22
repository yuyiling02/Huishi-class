Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root "宣传物料"
$base = "C:\Users\yuyiling\xwechat_files\wxid_43r7p4iumoj422_eff3\temp\RWTemp\2026-05\8d712d628822b5d1c3fef7a4d6e4f5da.png"
if (-not (Test-Path $base)) {
  $base = Join-Path $assets "慧视课堂-易拉宝-参考版-4K.png"
}
$out = Join-Path $assets "乡学数智课堂-基于原版文字替换-易拉宝-4K.png"

$sceneImages = @(
  (Join-Path $assets "慧视课堂-乡村教育低成本实操照片.png"),
  (Join-Path $assets "慧视课堂-乡村教育真人实操照片.png"),
  (Join-Path $assets "慧视课堂-乡村课堂真人实操主图.png"),
  (Join-Path $assets "慧视课堂-真人实操教学照片.png")
)

$src = [System.Drawing.Image]::FromFile($base)
$bmp = [System.Drawing.Bitmap]::new($src.Width, $src.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.DrawImage($src, 0, 0, $src.Width, $src.Height)
$src.Dispose()

function C($a, $r, $gg, $b) { [System.Drawing.Color]::FromArgb($a, $r, $gg, $b) }
function Rect($x, $y, $w, $h) { [System.Drawing.Rectangle]::new([int]$x, [int]$y, [int]$w, [int]$h) }
function RectF($x, $y, $w, $h) { [System.Drawing.RectangleF]::new([float]$x, [float]$y, [float]$w, [float]$h) }
function Font($size, $style = "Regular") { [System.Drawing.Font]::new("Microsoft YaHei UI", [float]$size, [System.Drawing.FontStyle]::$style, [System.Drawing.GraphicsUnit]::Pixel) }
function Brush($color) { [System.Drawing.SolidBrush]::new($color) }
function Pen($color, $width = 1) { [System.Drawing.Pen]::new($color, [float]$width) }

function RoundPath($x, $y, $w, $h, $r) {
  $p = [System.Drawing.Drawing2D.GraphicsPath]::new()
  if ($r -le 0) { $p.AddRectangle((Rect $x $y $w $h)); return $p }
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function FillRound($x, $y, $w, $h, $r, $brush) {
  $p = RoundPath $x $y $w $h $r
  $g.FillPath($brush, $p)
  $p.Dispose()
}

function StrokeRound($x, $y, $w, $h, $r, $pen) {
  $p = RoundPath $x $y $w $h $r
  $g.DrawPath($pen, $p)
  $p.Dispose()
}

function Text($s, $font, $brush, $rect, $align = "Near", $line = "Near") {
  $sf = [System.Drawing.StringFormat]::new()
  $sf.Alignment = [System.Drawing.StringAlignment]::$align
  $sf.LineAlignment = [System.Drawing.StringAlignment]::$line
  $sf.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
  $g.DrawString($s, $font, $brush, $rect, $sf)
  $sf.Dispose()
}

function TextPath($s, $font, $rect, $fill, $stroke, $strokeWidth, $align = "Near") {
  $sf = [System.Drawing.StringFormat]::new()
  $sf.Alignment = [System.Drawing.StringAlignment]::$align
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddString($s, $font.FontFamily, [int]$font.Style, $font.Size, $rect, $sf)
  $g.DrawPath((Pen $stroke $strokeWidth), $path)
  $g.FillPath((Brush $fill), $path)
  $path.Dispose()
  $sf.Dispose()
}

function CoverBlue($x, $y, $w, $h) {
  $br = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect $x $y $w $h), (C 255 1 36 118), (C 255 0 93 190), 0)
  $g.FillRectangle($br, $x, $y, $w, $h)
  $br.Dispose()
  $p = Pen (C 58 87 197 255) 2
  for ($i = -200; $i -lt $w + 200; $i += 120) {
    $g.DrawLine($p, $x + $i, $y, $x + $i + 360, $y + $h)
  }
  $p.Dispose()
}

function SectionBar($n, $title, $x, $y, $w) {
  $br = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect $x $y $w 88), (C 255 0 77 176), (C 255 63 196 245), 0)
  FillRound $x $y $w 88 0 $br
  $br.Dispose()
  Text $n (Font 51 "Bold") (Brush $white) (RectF ($x + 8) ($y - 2) 92 90) "Center" "Center"
  $g.DrawLine((Pen (C 200 255 255 255) 4), $x + 105, $y + 17, $x + 105, $y + 70)
  Text $title (Font 45 "Bold") (Brush $white) (RectF ($x + 128) ($y - 2) ($w - 140) 90) "Near" "Center"
}

function WhitePatch($x, $y, $w, $h, $r = 0) {
  FillRound $x $y $w $h $r (Brush (C 255 255 255 255))
}

function LightPatch($x, $y, $w, $h, $r = 12) {
  FillRound $x $y $w $h $r (Brush (C 255 247 252 255))
}

function DrawImageCrop($path, $x, $y, $w, $h, $r) {
  $img = [System.Drawing.Image]::FromFile($path)
  $ratio = $img.Width / $img.Height
  $target = $w / $h
  if ($ratio -gt $target) {
    $sh = $img.Height; $sw = [int]($sh * $target); $sx = [int](($img.Width - $sw) / 2); $sy = 0
  } else {
    $sw = $img.Width; $sh = [int]($sw / $target); $sx = 0; $sy = [int](($img.Height - $sh) / 2)
  }
  $clip = RoundPath $x $y $w $h $r
  $old = $g.Clip
  $g.SetClip($clip)
  $g.DrawImage($img, (Rect $x $y $w $h), (Rect $sx $sy $sw $sh), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Clip = $old
  $clip.Dispose()
  $img.Dispose()
}

$blue = C 255 0 63 156
$deep = C 255 4 45 126
$cyan = C 255 68 217 255
$orange = C 255 255 185 0
$ink = C 255 18 54 99
$muted = C 255 58 80 116
$white = C 255 255 255 255

# 顶部标题区：保留右侧 AI 头部视觉，仅覆盖左侧文字与中部定位语。
CoverBlue 20 35 1600 610
TextPath "乡学数智课堂" (Font 158 "Bold") (RectF 86 52 1320 205) $white (C 210 14 48 138) 10 "Near"
Text "—— 基层普惠型低成本多模态三维教学系统" (Font 56 "Bold") (Brush $white) (RectF 96 265 1460 90) "Near" "Center"
FillRound 86 405 1510 102 50 (Brush (C 55 18 86 178))
StrokeRound 86 405 1510 102 50 (Pen (C 170 175 220 255) 3)
Text "扎根乡村振兴基层普惠沃土，以低成本架构实现高配教学效能" (Font 35 "Bold") (Brush $white) (RectF 122 412 1435 42) "Center" "Center"
Text "操作简易易部署，切实落地乡村课堂教学赋能" (Font 35 "Bold") (Brush $orange) (RectF 122 455 1435 42) "Center" "Center"
CoverBlue 470 520 960 170
Text "智慧教学创新团队" (Font 40 "Bold") (Brush $white) (RectF 646 558 510 70) "Center" "Center"
$g.DrawLine((Pen (C 155 255 255 255) 4), 585, 590, 690, 590)
$g.DrawLine((Pen (C 155 255 255 255) 4), 1200, 590, 1310, 590)

# 01 项目简介
SectionBar "01" "项目简介" 52 718 585
WhitePatch 70 830 1378 205 0
Text "慧视乡学聚焦乡村教育普惠发展，依托多模态三维技术搭建智慧教学体系。设备投入成本低、功能配置水准高，界面操作简单易懂，部署落地便捷高效，把优质智能教学服务普及至基层乡村校园，助力乡村振兴教育提质。" (Font 34 "Bold") (Brush $ink) (RectF 78 842 1328 148) "Near" "Center"

$cardXs = @(70, 555, 1040, 1525)
$titles = @("低成本易部署", "无键鼠智能操控", "离线全域适配", "原创自研独有技术")
$descs = @(
  "赋能乡村教育振兴，仅笔记本 + 摄像头即可运行，无需重型设备，大幅缩减使用成本",
  "摒弃传统鼠标操作，手势、语音即可交互，上手简单，授课操作灵活顺畅",
  "脱离网络也可稳定运行，偏远山区等场地均可正常落地使用",
  "全套技术自主研发，市面暂无同类产品，创新优势显著"
)
for ($i = 0; $i -lt 4; $i++) {
  $x = $cardXs[$i]
  FillRound $x 1058 430 235 14 (Brush (C 255 255 255 255))
  StrokeRound $x 1058 430 235 14 (Pen (C 120 170 205 240) 3)
  Text ([string]($i + 1)) (Font 34 "Bold") (Brush $deep) (RectF ($x + 28) 1080 56 56) "Center" "Center"
  Text $titles[$i] (Font 29 "Bold") (Brush $deep) (RectF ($x + 90) 1070 310 42) "Center" "Center"
  Text $descs[$i] (Font 21 "Bold") (Brush $muted) (RectF ($x + 44) 1120 342 130) "Center" "Near"
}

# 02 系统框架流程文字
SectionBar "02" "系统框架" 52 1323 585
$flowTitles = @("教学目标输入", "低成本适配", "3D 模型调用", "无键鼠交互演示", "课堂效果反馈")
$flowDesc = @(
  "明确乡村教学目标`n与知识要点",
  "适配基层设备条件`n生成轻量化方案",
  "匹配模型资源`n生成适配内容",
  "手势/语音无键鼠`n沉浸式演示",
  "课堂效果评估`n持续优化体验"
)
$flowX = @(235, 665, 1090, 1515, 1905)
WhitePatch 70 1588 2008 170 0
for ($i = 0; $i -lt 5; $i++) {
  Text $flowTitles[$i] (Font 30 "Bold") (Brush $deep) (RectF ($flowX[$i] - 150) 1595 305 42) "Center" "Center"
  Text $flowDesc[$i] (Font 23 "Bold") (Brush $muted) (RectF ($flowX[$i] - 150) 1638 305 85) "Center" "Near"
}

# 中间界面截图标题改名
FillRound 95 1795 360 86 12 (Brush (C 240 238 250 255))
Text "乡学数智课堂" (Font 30 "Bold") (Brush $deep) (RectF 136 1800 270 38) "Near" "Center"
Text "AI 交互式教学系统" (Font 18 "Bold") (Brush (C 255 87 105 140)) (RectF 138 1833 255 28) "Near" "Center"

# 03 普惠适配技术
SectionBar "03" "创新点 1  普惠适配技术" 52 2952 910
$agentXs = @(95, 765, 1465)
$agentTitles = @("低成本适配引擎", "离线运行模块", "乡村教学场景优化")
$agentBodies = @(
  "适配乡村设备条件`n轻量化系统架构`n降低硬件门槛`n快速部署落地",
  "脱离网络稳定运行`n偏远场地正常使用`n本地模型资源调用`n无网教学不受限",
  "贴合基层教学需求`n适配学科教学内容`n简化操作流程`n提升课堂实用性"
)
for ($i = 0; $i -lt 3; $i++) {
  $border = $(if($i -eq 1){C 255 0 165 160}elseif($i -eq 2){C 255 245 139 31}else{$deep})
  FillRound ($agentXs[$i] - 5) 3068 572 292 14 (Brush (C 255 255 255 255))
  StrokeRound ($agentXs[$i] - 5) 3068 572 292 14 (Pen $border 4)
  $g.FillEllipse((Brush (C 255 245 250 255)), ($agentXs[$i] + 36), 3130, 104, 104)
  $g.DrawEllipse((Pen $border 7), ($agentXs[$i] + 36), 3130, 104, 104)
  Text @("低","离","乡")[$i] (Font 44 "Bold") (Brush $border) (RectF ($agentXs[$i] + 36) 3128 104 104) "Center" "Center"
  Text $agentTitles[$i] (Font 29 "Bold") (Brush ($(if($i -eq 2){C 255 239 128 21}else{$deep}))) (RectF ($agentXs[$i] + 128) 3088 395 45) "Near" "Center"
  Text $agentBodies[$i] (Font 24 "Bold") (Brush $ink) (RectF ($agentXs[$i] + 128) 3133 395 128) "Near" "Near"
}
WhitePatch 250 3310 1660 135 0
Text "普惠适配驱动乡村教学持续优化" (Font 38 "Bold") (Brush $deep) (RectF 725 3336 700 62) "Center" "Center"

# 04 无门槛多模态交互
SectionBar "04" "创新点 2  无门槛多模态交互" 52 3507 1060
$itemXs = @(85, 500, 910, 1322, 1735)
$itemTitles = @("手势操控", "语音指令", "离线可用", "轻量化运行", "场景适配")
$itemDesc = @("无键鼠自然交互", "解放双手授课", "偏远场地稳定运行", "低配设备流畅运行", "适配乡村课堂教学")
for ($i = 0; $i -lt 5; $i++) {
  WhitePatch ($itemXs[$i] + 18) 3624 314 115 0
  Text $itemTitles[$i] (Font 30 "Bold") (Brush $deep) (RectF ($itemXs[$i] + 25) 3628 300 45) "Center" "Center"
  Text $itemDesc[$i] (Font 23 "Bold") (Brush $muted) (RectF ($itemXs[$i] + 20) 3671 310 50) "Center" "Center"
}

# 05 应用场景：替换为乡村课堂真人实操图，保留四卡片布局。
SectionBar "05" "应用场景" 52 4026 585
$appXs = @(70, 562, 1054, 1546)
$appTitles = @("乡村课堂教学", "基层科普展示", "实验辅助教学", "教研成果交流")
$appDesc = @("提升基层课堂吸引力与理解度", "生动直观，乡村科普效果显著", "复杂过程可视化演示", "展示更高效，推广更便捷")
for ($i = 0; $i -lt 4; $i++) {
  $x = $appXs[$i]
  FillRound $x 4132 430 430 14 (Brush (C 255 255 255 255))
  DrawImageCrop $sceneImages[$i] ($x + 8) 4146 414 178 10
  FillRound ($x + 26) 4290 378 126 18 (Brush (C 250 255 255 255))
  Text $appTitles[$i] (Font 32 "Bold") (Brush $deep) (RectF ($x + 32) 4310 366 44) "Center" "Center"
  Text $appDesc[$i] (Font 22 "Bold") (Brush $muted) (RectF ($x + 20) 4352 390 45) "Center" "Center"
  StrokeRound $x 4132 430 430 14 (Pen (C 130 165 205 242) 3)
}

# 底部收尾区：加入三行短句 + 对仗标语 + 最底部小字。
WhitePatch 30 4488 2098 72 0
FillRound 28 4528 2104 247 18 (Brush (C 255 255 255 255))
StrokeRound 28 4528 2104 247 18 (Pen (C 150 162 203 242) 3)
$slogans = @(
  "普惠下沉乡村一线，低成本打造高配三维教学体系",
  "多模态智能辅教，上手无门槛，落地快见效",
  "聚力乡村教育振兴，轻量部署，普惠共享优质教学资源"
)
for ($i = 0; $i -lt 3; $i++) {
  Text $slogans[$i] (Font 24 "Bold") (Brush (C 255 58 88 136)) (RectF 210 (4548 + $i * 31) 1740 30) "Center" "Center"
}
Text "普惠乡园智教同行，轻量易落赋能振兴" (Font 43 "Bold") (Brush $deep) (RectF 300 4638 1560 56) "Center" "Center"
Text "期待与您合作，共创乡村智慧教育新未来" (Font 26 "Bold") (Brush (C 255 65 86 125)) (RectF 420 4693 1320 36) "Center" "Center"

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host $out
