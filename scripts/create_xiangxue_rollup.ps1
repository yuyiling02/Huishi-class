Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root "宣传物料"
$out = Join-Path $assets "乡学数智课堂-基层普惠型低成本多模态三维教学系统-易拉宝-4K.png"
$scenePath = Join-Path $assets "慧视课堂-乡村教育低成本实操照片.png"

$W = 2160
$H = 4800
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

function ColorArgb($a, $r, $gg, $b) {
  return [System.Drawing.Color]::FromArgb($a, $r, $gg, $b)
}

function New-Font($size, $style = "Regular") {
  $fontStyle = [System.Drawing.FontStyle]::$style
  return [System.Drawing.Font]::new("Microsoft YaHei UI", [float]$size, $fontStyle, [System.Drawing.GraphicsUnit]::Pixel)
}

function Rect($x, $y, $w, $h) {
  return [System.Drawing.Rectangle]::new([int]$x, [int]$y, [int]$w, [int]$h)
}

function RectF($x, $y, $w, $h) {
  return [System.Drawing.RectangleF]::new([float]$x, [float]$y, [float]$w, [float]$h)
}

function RoundedPath($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Fill-Round($x, $y, $w, $h, $r, $brush) {
  if ($r -le 0) {
    $g.FillRectangle($brush, $x, $y, $w, $h)
    return
  }
  $p = RoundedPath $x $y $w $h $r
  $g.FillPath($brush, $p)
  $p.Dispose()
}

function Stroke-Round($x, $y, $w, $h, $r, $pen) {
  if ($r -le 0) {
    $g.DrawRectangle($pen, $x, $y, $w, $h)
    return
  }
  $p = RoundedPath $x $y $w $h $r
  $g.DrawPath($pen, $p)
  $p.Dispose()
}

function DrawText($text, $font, $brush, $rect, $align = "Near", $line = "Near") {
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::$align
  $sf.LineAlignment = [System.Drawing.StringAlignment]::$line
  $sf.FormatFlags = 0
  $sf.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
  $g.DrawString($text, $font, $brush, $rect, $sf)
  $sf.Dispose()
}

function DrawGlowText($text, $font, $x, $y, $w, $h) {
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $em = $font.Size
  $path.AddString($text, $font.FontFamily, [int]$font.Style, $em, (RectF $x $y $w $h), $sf)
  $outline = [System.Drawing.Pen]::new((ColorArgb 180 50 195 255), 12)
  $g.DrawPath($outline, $path)
  $g.FillPath((New-Object System.Drawing.SolidBrush (ColorArgb 255 255 255 255)), $path)
  $outline.Dispose()
  $path.Dispose()
  $sf.Dispose()
}

function DrawPillTitle($number, $title, $x, $y, $w) {
  $br = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect $x $y $w 94), (ColorArgb 255 14 112 222), (ColorArgb 255 66 202 248), 0)
  Fill-Round $x $y $w 94 45 $br
  $br.Dispose()
  DrawText $number (New-Font 48 "Bold") ([System.Drawing.SolidBrush]::new((ColorArgb 255 255 255 255))) (RectF ($x + 42) ($y + 8) 100 78) "Near" "Center"
  DrawText $title (New-Font 45 "Bold") ([System.Drawing.SolidBrush]::new((ColorArgb 255 255 255 255))) (RectF ($x + 150) ($y + 8) ($w - 170) 78) "Near" "Center"
}

function DrawIcon($kind, $cx, $cy, $accent) {
  $pen = [System.Drawing.Pen]::new($accent, 9)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawEllipse($pen, $cx - 42, $cy - 42, 84, 84)
  if ($kind -eq 1) {
    $g.DrawRectangle($pen, $cx - 34, $cy - 18, 68, 44)
    $g.DrawLine($pen, $cx - 18, $cy + 34, $cx + 18, $cy + 34)
  } elseif ($kind -eq 2) {
    $g.DrawLine($pen, $cx - 30, $cy + 20, $cx - 8, $cy - 28)
    $g.DrawLine($pen, $cx - 8, $cy - 28, $cx + 15, $cy + 20)
    $g.DrawLine($pen, $cx + 15, $cy + 20, $cx + 34, $cy - 8)
  } elseif ($kind -eq 3) {
    $g.DrawArc($pen, $cx - 35, $cy - 24, 70, 50, 200, 140)
    $g.DrawLine($pen, $cx - 32, $cy + 30, $cx + 32, $cy - 30)
  } else {
    $g.DrawEllipse($pen, $cx - 24, $cy - 30, 48, 60)
    $g.DrawLine($pen, $cx, $cy + 32, $cx, $cy + 48)
    $g.DrawLine($pen, $cx - 18, $cy + 48, $cx + 18, $cy + 48)
  }
  $pen.Dispose()
}

$darkBlue = ColorArgb 255 6 56 137
$midBlue = ColorArgb 255 13 120 214
$cyan = ColorArgb 255 103 238 255
$white = ColorArgb 255 255 255 255
$ink = ColorArgb 255 16 52 96
$muted = ColorArgb 255 70 93 128

# Background
$bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect 0 0 $W $H), (ColorArgb 255 7 59 145), (ColorArgb 255 210 241 245), 90)
$g.FillRectangle($bgBrush, 0, 0, $W, $H)
$bgBrush.Dispose()

$topGlow = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect 0 0 $W 1280), (ColorArgb 255 9 46 124), (ColorArgb 90 25 194 255), 45)
$g.FillRectangle($topGlow, 0, 0, $W, 1280)
$topGlow.Dispose()

$linePen = [System.Drawing.Pen]::new((ColorArgb 65 130 210 255), 3)
for ($i = -200; $i -lt 2400; $i += 130) {
  $g.DrawLine($linePen, $i, 135, $i + 320, 820)
}
$linePen.Dispose()

$dotBrush = New-Object System.Drawing.SolidBrush (ColorArgb 95 120 244 255)
for ($i = 0; $i -lt 26; $i++) {
  $x = 150 + (($i * 391) % 1850)
  $y = 90 + (($i * 173) % 780)
  $g.FillEllipse($dotBrush, $x, $y, 8, 8)
}
$dotBrush.Dispose()

# Header
DrawText "AI" (New-Font 152 "Bold") ([System.Drawing.SolidBrush]::new((ColorArgb 185 116 248 245))) (RectF 1660 140 360 190) "Center" "Center"
DrawGlowText "乡学数智课堂" (New-Font 152 "Bold") 150 245 1860 230
DrawText "—— 基层普惠型低成本多模态三维教学系统" (New-Font 58 "Bold") ([System.Drawing.SolidBrush]::new($white)) (RectF 160 505 1840 86) "Center" "Center"

$tagBr = New-Object System.Drawing.SolidBrush (ColorArgb 148 238 247 255)
Fill-Round 210 635 1740 90 44 $tagBr
$tagBr.Dispose()
DrawText "扎根乡村振兴基层普惠沃土，以低成本架构实现高配教学效能，操作简易易部署，切实落地乡村课堂教学赋能" (New-Font 36 "Bold") ([System.Drawing.SolidBrush]::new((ColorArgb 255 0 76 148))) (RectF 250 642 1660 78) "Center" "Center"

# Main white panel
$panelBrush = New-Object System.Drawing.SolidBrush (ColorArgb 246 255 255 255)
Fill-Round 78 835 2004 3605 48 $panelBrush
$panelBrush.Dispose()
Stroke-Round 78 835 2004 3605 48 ([System.Drawing.Pen]::new((ColorArgb 170 167 223 255), 4))

# Intro
DrawPillTitle "01" "项目简介" 135 910 700
DrawText "慧视乡学聚焦乡村教育普惠发展，依托多模态三维技术搭建智慧教学体系。设备投入成本低、功能配置水准高，界面操作简单易懂，部署落地便捷高效，把优质智能教学服务普及至基层乡村校园，助力乡村振兴教育提质。" (New-Font 42 "Regular") ([System.Drawing.SolidBrush]::new($ink)) (RectF 150 1045 1860 210) "Center" "Center"

# Highlight cards
DrawPillTitle "02" "四大核心亮点" 135 1300 780
$cardY = 1445
$cardW = 455
$cardH = 650
$gap = 36
$startX = 135
$cards = @(
  @{T="低成本易部署"; D="赋能乡村教育振兴，仅笔记本 + 摄像头即可运行，无需重型设备，大幅缩减使用成本"; C=(ColorArgb 255 30 144 255)},
  @{T="无键鼠智能操控"; D="摒弃传统鼠标操作，手势、语音即可交互，上手简单，授课操作灵活顺畅"; C=(ColorArgb 255 0 183 172)},
  @{T="离线全域适配"; D="脱离网络也可稳定运行，偏远山区等场地均可正常落地使用"; C=(ColorArgb 255 255 139 32)},
  @{T="原创自研独有技术"; D="全套技术自主研发，市面暂无同类产品，创新优势显著"; C=(ColorArgb 255 117 89 246)}
)
for ($i = 0; $i -lt 4; $i++) {
  $x = $startX + $i * ($cardW + $gap)
  $cb = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect $x $cardY $cardW $cardH), (ColorArgb 255 235 250 255), (ColorArgb 255 218 239 255), 90)
  Fill-Round $x $cardY $cardW $cardH 34 $cb
  $cb.Dispose()
  Stroke-Round $x $cardY $cardW $cardH 34 ([System.Drawing.Pen]::new((ColorArgb 150 147 211 255), 3))
  $circle = New-Object System.Drawing.SolidBrush (ColorArgb 255 255 255 255)
  $g.FillEllipse($circle, $x + 156, $cardY + 58, 142, 142)
  $circle.Dispose()
  DrawIcon ($i + 1) ($x + 227) ($cardY + 129) $cards[$i].C
  DrawText $cards[$i].T (New-Font 42 "Bold") ([System.Drawing.SolidBrush]::new((ColorArgb 255 0 80 160))) (RectF ($x + 35) ($cardY + 255) ($cardW - 70) 100) "Center" "Center"
  DrawText $cards[$i].D (New-Font 34 "Regular") ([System.Drawing.SolidBrush]::new($muted)) (RectF ($x + 42) ($cardY + 385) ($cardW - 84) 210) "Center" "Near"
}

# Slogans
$sloganY = 2185
$slogans = @(
  "普惠下沉乡村一线，低成本打造高配三维教学体系",
  "多模态智能辅教，上手无门槛，落地快见效",
  "聚力乡村教育振兴，轻量部署，普惠共享优质教学资源"
)
for ($i = 0; $i -lt 3; $i++) {
  $y = $sloganY + $i * 124
  $sb = New-Object System.Drawing.SolidBrush (ColorArgb 255 230 247 255)
  Fill-Round 260 $y 1640 84 38 $sb
  $sb.Dispose()
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (ColorArgb 255 18 176 153)), 305, $y + 20, 44, 44)
  DrawText "✓" (New-Font 38 "Bold") ([System.Drawing.SolidBrush]::new($white)) (RectF 305 ($y + 8) 44 54) "Center" "Center"
  DrawText $slogans[$i] (New-Font 42 "Bold") ([System.Drawing.SolidBrush]::new((ColorArgb 255 0 83 160))) (RectF 380 ($y + 7) 1420 70) "Center" "Center"
}

# Scenario section
DrawPillTitle "03" "应用场景" 135 2605 670
$scene = [System.Drawing.Image]::FromFile($scenePath)
$srcRatio = $scene.Width / $scene.Height
$dstX = 135
$dstY = 2740
$dstW = 1890
$dstH = 1065
$dstRatio = $dstW / $dstH
if ($srcRatio -gt $dstRatio) {
  $srcH = $scene.Height
  $srcW = [int]($srcH * $dstRatio)
  $srcX = [int](($scene.Width - $srcW) / 2)
  $srcY = 0
} else {
  $srcW = $scene.Width
  $srcH = [int]($srcW / $dstRatio)
  $srcX = 0
  $srcY = [int](($scene.Height - $srcH) / 2)
}
$clipPath = RoundedPath $dstX $dstY $dstW $dstH 36
$oldClip = $g.Clip
$g.SetClip($clipPath)
$g.DrawImage($scene, (Rect $dstX $dstY $dstW $dstH), (Rect $srcX $srcY $srcW $srcH), [System.Drawing.GraphicsUnit]::Pixel)
$g.Clip = $oldClip
$clipPath.Dispose()
$scene.Dispose()
Stroke-Round $dstX $dstY $dstW $dstH 36 ([System.Drawing.Pen]::new((ColorArgb 210 151 218 255), 5))

$overlay = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect $dstX ($dstY + 800) $dstW 265), (ColorArgb 20 0 70 160), (ColorArgb 185 0 68 158), 90)
Fill-Round $dstX ($dstY + 800) $dstW 265 0 $overlay
$overlay.Dispose()
DrawText "真人实操身影 + 屏幕三维教学界面" (New-Font 54 "Bold") ([System.Drawing.SolidBrush]::new($white)) (RectF 195 3560 1770 90) "Center" "Center"
DrawText "笔记本 + 摄像头即可完成三维教学演示，课堂操作轻量直观" (New-Font 36 "Regular") ([System.Drawing.SolidBrush]::new((ColorArgb 255 130 250 255))) (RectF 195 3644 1770 70) "Center" "Center"

# Closing
$endBr = New-Object System.Drawing.SolidBrush (ColorArgb 255 5 78 166)
Fill-Round 135 3925 1890 225 40 $endBr
$endBr.Dispose()
DrawText "普惠乡园智教同行，轻量易落赋能振兴" (New-Font 62 "Bold") ([System.Drawing.SolidBrush]::new($white)) (RectF 180 3970 1800 95) "Center" "Center"
DrawText "期待与您合作，共创乡村智慧教育新未来" (New-Font 36 "Regular") ([System.Drawing.SolidBrush]::new((ColorArgb 230 220 247 255))) (RectF 180 4058 1800 58) "Center" "Center"

# Subtle lower tech lines
$lowerPen = [System.Drawing.Pen]::new((ColorArgb 70 8 137 215), 3)
for ($i = 0; $i -lt 9; $i++) {
  $y = 4300 + $i * 54
  $g.DrawLine($lowerPen, 160 + $i * 60, $y, 2000 - $i * 35, $y + 95)
}
$lowerPen.Dispose()

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host $out
