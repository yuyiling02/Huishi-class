Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root "宣传物料"
$public = Join-Path $root "public"
$out = Join-Path $assets "乡学数智课堂-高级参考版-易拉宝-4K.png"
$scenePath = Join-Path $assets "慧视课堂-乡村教育低成本实操照片.png"
$scenePath2 = Join-Path $assets "慧视课堂-乡村教育真人实操照片.png"
$scenePath3 = Join-Path $assets "慧视课堂-乡村课堂真人实操主图.png"
$scenePath4 = Join-Path $assets "慧视课堂-真人实操教学照片.png"
$heartPath = Join-Path $public "images\heart-structure.png"
$diamondPath = Join-Path $public "images\diamond-structure.png"
$earthPath = Join-Path $public "textures\earth_atmos_2048.jpg"

$W = 2160
$H = 4800
$bmp = [System.Drawing.Bitmap]::new($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

function C($a, $r, $gg, $b) { [System.Drawing.Color]::FromArgb($a, $r, $gg, $b) }
function Rect($x, $y, $w, $h) { [System.Drawing.Rectangle]::new([int]$x, [int]$y, [int]$w, [int]$h) }
function RectF($x, $y, $w, $h) { [System.Drawing.RectangleF]::new([float]$x, [float]$y, [float]$w, [float]$h) }
function Font($size, $style = "Regular") { [System.Drawing.Font]::new("Microsoft YaHei UI", [float]$size, [System.Drawing.FontStyle]::$style, [System.Drawing.GraphicsUnit]::Pixel) }
function Brush($color) { [System.Drawing.SolidBrush]::new($color) }
function Pen($color, $width = 1) { [System.Drawing.Pen]::new($color, [float]$width) }

function PathRound($x, $y, $w, $h, $r) {
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
  $p = PathRound $x $y $w $h $r
  $g.FillPath($brush, $p)
  $p.Dispose()
}

function StrokeRound($x, $y, $w, $h, $r, $pen) {
  $p = PathRound $x $y $w $h $r
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

function GlowText($s, $font, $rect) {
  $sf = [System.Drawing.StringFormat]::new()
  $sf.Alignment = [System.Drawing.StringAlignment]::Near
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddString($s, $font.FontFamily, [int]$font.Style, $font.Size, $rect, $sf)
  $g.DrawPath((Pen (C 210 52 150 255) 13), $path)
  $g.DrawPath((Pen (C 150 8 45 135) 24), $path)
  $g.FillPath((Brush (C 255 255 255 255)), $path)
  $path.Dispose()
  $sf.Dispose()
}

function SectionTitle($n, $title, $x, $y, $w) {
  $grad = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect $x $y $w 92), (C 255 0 72 176), (C 255 62 201 255), 0)
  FillRound $x $y $w 92 24 $grad
  $grad.Dispose()
  Text $n (Font 54 "Bold") (Brush (C 255 255 255 255)) (RectF ($x + 35) ($y + 4) 125 84) "Center" "Center"
  $g.DrawLine((Pen (C 190 255 255 255) 4), $x + 154, $y + 17, $x + 154, $y + 75)
  Text $title (Font 46 "Bold") (Brush (C 255 255 255 255)) (RectF ($x + 185) ($y + 4) ($w - 205) 84) "Near" "Center"
}

function DrawArrow($x1, $y1, $x2, $y2) {
  $pen = Pen (C 255 0 72 176) 7
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Triangle
  $g.DrawLine($pen, $x1, $y1, $x2, $y2)
  $pen.Dispose()
}

function DrawCircleIcon($kind, $cx, $cy, $color) {
  $g.FillEllipse((Brush (C 255 245 251 255)), $cx - 62, $cy - 62, 124, 124)
  $g.DrawEllipse((Pen (C 170 91 147 226) 4), $cx - 62, $cy - 62, 124, 124)
  $p = Pen $color 9
  $p.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  if ($kind -eq "target") {
    $g.DrawEllipse($p, $cx - 28, $cy - 28, 56, 56); $g.DrawLine($p, $cx - 45, $cy, $cx + 45, $cy); $g.DrawLine($p, $cx, $cy - 45, $cx, $cy + 45)
  } elseif ($kind -eq "brain") {
    $g.DrawEllipse($p, $cx - 34, $cy - 38, 68, 76); $g.DrawLine($p, $cx, $cy - 38, $cx, $cy + 38); $g.DrawArc($p, $cx - 24, $cy - 22, 34, 32, 200, 260)
  } elseif ($kind -eq "cube") {
    $pts = @([System.Drawing.Point]::new($cx, $cy - 42), [System.Drawing.Point]::new($cx + 38, $cy - 20), [System.Drawing.Point]::new($cx + 38, $cy + 24), [System.Drawing.Point]::new($cx, $cy + 46), [System.Drawing.Point]::new($cx - 38, $cy + 24), [System.Drawing.Point]::new($cx - 38, $cy - 20))
    $g.DrawPolygon($p, $pts); $g.DrawLine($p, $cx, $cy - 42, $cx, $cy + 46); $g.DrawLine($p, $cx - 38, $cy - 20, $cx, $cy); $g.DrawLine($p, $cx + 38, $cy - 20, $cx, $cy)
  } elseif ($kind -eq "hand") {
    $g.DrawLine($p, $cx - 18, $cy + 38, $cx - 18, $cy - 30); $g.DrawLine($p, $cx - 2, $cy + 35, $cx - 2, $cy - 42); $g.DrawLine($p, $cx + 14, $cy + 32, $cx + 14, $cy - 26); $g.DrawArc($p, $cx - 28, $cy, 72, 56, 12, 150)
  } else {
    $g.DrawLine($p, $cx - 34, $cy + 38, $cx - 34, $cy + 5); $g.DrawLine($p, $cx, $cy + 38, $cx, $cy - 22); $g.DrawLine($p, $cx + 34, $cy + 38, $cx + 34, $cy - 42); $g.DrawLine($p, $cx - 50, $cy + 40, $cx + 50, $cy + 40)
  }
  $p.Dispose()
}

function ImageCrop($path, $x, $y, $w, $h, $r) {
  $img = [System.Drawing.Image]::FromFile($path)
  $ratio = $img.Width / $img.Height
  $target = $w / $h
  if ($ratio -gt $target) {
    $sh = $img.Height; $sw = [int]($sh * $target); $sx = [int](($img.Width - $sw) / 2); $sy = 0
  } else {
    $sw = $img.Width; $sh = [int]($sw / $target); $sx = 0; $sy = [int](($img.Height - $sh) / 2)
  }
  $clip = PathRound $x $y $w $h $r
  $old = $g.Clip
  $g.SetClip($clip)
  $g.DrawImage($img, (Rect $x $y $w $h), (Rect $sx $sy $sw $sh), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Clip = $old
  $clip.Dispose()
  $img.Dispose()
}

# Background
$bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect 0 0 $W $H), (C 255 3 43 124), (C 255 224 245 249), 90)
$g.FillRectangle($bg, 0, 0, $W, $H)
$bg.Dispose()
$hero = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect 0 0 $W 760), (C 255 4 37 116), (C 255 0 91 190), 0)
$g.FillRectangle($hero, 0, 0, $W, 760)
$hero.Dispose()
$netPen = Pen (C 70 80 210 255) 2
for ($i = -100; $i -lt 2300; $i += 115) { $g.DrawLine($netPen, $i, 35, $i + 520, 705) }
for ($i = 0; $i -lt 70; $i++) {
  $x = 30 + (($i * 251) % 2090); $y = 20 + (($i * 149) % 700)
  $g.FillEllipse((Brush (C 120 98 230 255)), $x, $y, 7, 7)
}
$netPen.Dispose()

# Hero typography and AI visual
GlowText "乡学数智课堂" (Font 162 "Bold") (RectF 84 58 1280 225)
Text "基层普惠型低成本多模态三维教学系统" (Font 70 "Bold") (Brush (C 255 255 255 255)) (RectF 98 282 1500 100) "Near" "Center"
$pill = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect 92 405 1390 88), (C 240 4 54 138), (C 200 25 120 222), 0)
FillRound 92 405 1390 88 44 $pill
$pill.Dispose()
StrokeRound 92 405 1390 88 44 (Pen (C 180 184 232 255) 3)
Text "AI" (Font 58 "Bold") (Brush (C 255 255 198 0)) (RectF 143 409 92 76) "Center" "Center"
Text "驱动乡村课堂演示，让复杂知识可见、可控、可讲解" (Font 42 "Bold") (Brush (C 255 255 255 255)) (RectF 245 410 1160 76) "Near" "Center"
Text "智慧教学创新团队" (Font 38 "Bold") (Brush (C 240 255 255 255)) (RectF 720 535 520 60) "Center" "Center"
$g.DrawLine((Pen (C 160 255 255 255) 4), 560, 565, 700, 565)
$g.DrawLine((Pen (C 160 255 255 255) 4), 1248, 565, 1390, 565)

# Head graphic
$headPen = Pen (C 210 57 224 255) 4
$headPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
$headPath.AddBezier(1705, 84, 1535, 118, 1538, 340, 1635, 383)
$headPath.AddBezier(1635, 383, 1662, 415, 1620, 450, 1578, 474)
$headPath.AddBezier(1578, 474, 1695, 492, 1795, 467, 1848, 398)
$headPath.AddBezier(1848, 398, 1932, 275, 1875, 78, 1705, 84)
$g.DrawPath($headPen, $headPath)
$headPath.Dispose()
$g.DrawEllipse((Pen (C 90 115 231 255) 5), 1518, 430, 440, 100)
Text "AI" (Font 118 "Bold") (Brush (C 210 123 245 255)) (RectF 1668 202 220 138) "Center" "Center"
for ($i = 0; $i -lt 38; $i++) {
  $x = 1565 + (($i * 73) % 320); $y = 110 + (($i * 91) % 315)
  $g.FillEllipse((Brush (C 190 78 226 255)), $x, $y, 8, 8)
  if ($i % 3 -eq 0) { $g.DrawLine((Pen (C 70 104 232 255) 2), $x, $y, 1670 + (($i * 59) % 230), 120 + (($i * 47) % 290)) }
}
$headPen.Dispose()

# Main panel
FillRound 54 690 2052 4050 58 (Brush (C 250 255 255 255))
StrokeRound 54 690 2052 4050 58 (Pen (C 150 163 219 255) 4)

# 01
SectionTitle "01" "项目简介" 86 720 760
Text "慧视乡学面向乡村教育普惠发展，把高成本、高门槛的沉浸式教学能力压缩到普通硬件中。系统依托多模态三维技术构建智慧教学体系，以低成本架构实现高配教学效能，支持手势、语音自然交互，并可在离线环境稳定落地。" (Font 38 "Bold") (Brush (C 255 21 55 101)) (RectF 118 835 1348 158) "Near" "Center"
ImageCrop $diamondPath 1515 750 505 245 18
$metrics = @(
  @{A="成本投入"; B="低"; C="笔记本 + 摄像头即可运行"},
  @{A="操作门槛"; B="低"; C="手势语音交互，上手简单"},
  @{A="部署范围"; B="广"; C="离线环境与基层场景适配"},
  @{A="技术壁垒"; B="高"; C="全套自研，差异化明显"}
)
for ($i = 0; $i -lt 4; $i++) {
  $x = 118 + $i * 490
  FillRound $x 1025 438 165 16 (Brush (C 255 248 252 255))
  StrokeRound $x 1025 438 165 16 (Pen (C 150 166 205 242) 3)
  DrawCircleIcon "target" ($x + 68) 1108 (C 255 0 75 180)
  Text $metrics[$i].A (Font 31 "Bold") (Brush (C 255 17 65 137)) (RectF ($x + 132) 1048 255 45) "Center" "Center"
  Text $metrics[$i].B (Font 49 "Bold") (Brush (C 255 16 137 230)) (RectF ($x + 132) 1088 255 48) "Center" "Center"
  Text $metrics[$i].C (Font 24 "Bold") (Brush (C 255 63 87 126)) (RectF ($x + 112) 1134 295 38) "Center" "Center"
}

# 02 Architecture
SectionTitle "02" "系统架构" 86 1235 760
$steps = @(
  @{I="target"; T="教学目标输入"; D="明确教学目标与知识要点"},
  @{I="brain"; T="AI 理解规划"; D="理解课堂目标生成教学方案"},
  @{I="cube"; T="3D 模型调用"; D="匹配模型资源生成演示内容"},
  @{I="hand"; T="手势语音交互"; D="多模态交互控制沉浸演示"},
  @{I="bar"; T="学情分析反馈"; D="实时数据分析反馈优化建议"}
)
for ($i = 0; $i -lt 5; $i++) {
  $cx = 235 + $i * 420
  DrawCircleIcon $steps[$i].I $cx 1440 (C 255 0 79 180)
  Text $steps[$i].T (Font 32 "Bold") (Brush (C 255 8 66 148)) (RectF ($cx - 145) 1515 290 45) "Center" "Center"
  Text $steps[$i].D (Font 24 "Bold") (Brush (C 255 63 85 126)) (RectF ($cx - 145) 1560 290 65) "Center" "Near"
  if ($i -lt 4) { DrawArrow ($cx + 105) 1440 ($cx + 285) 1440 }
}

FillRound 96 1665 1968 1015 28 (Brush (C 255 238 249 255))
StrokeRound 96 1665 1968 1015 28 (Pen (C 150 183 222 255) 3)
ImageCrop $scenePath 126 1695 1908 955 24
$fade = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect 126 2380 1908 270), (C 20 0 70 160), (C 205 0 63 146), 90)
FillRound 126 2380 1908 270 0 $fade
$fade.Dispose()
Text "低成本硬件接入，真人实操与屏幕三维教学同步呈现" (Font 52 "Bold") (Brush (C 255 255 255 255)) (RectF 160 2425 1840 70) "Center" "Center"
Text "手势、语音、三维模型与课堂讲解融合，适合乡村课堂快速部署" (Font 34 "Bold") (Brush (C 255 141 244 255)) (RectF 160 2495 1840 58) "Center" "Center"

# 03
SectionTitle "03" "创新点 1  多智能体协同" 86 2735 1000
$agents = @(
  @{T="理解规划 Agent"; D="解析教学目标`n提炼关键知识点`n制定教学策略`n生成教学方案"; Col=(C 255 0 84 180); Icon="brain"},
  @{T="演示执行 Agent"; D="3D 模型检索与调用`n演示流程自动编排`n多模态交互控制`n动画与效果呈现"; Col=(C 255 0 169 162); Icon="cube"},
  @{T="学情评估 Agent"; D="学习数据采集`n知识点掌握分析`n课堂效果评估`n个性化改进建议"; Col=(C 255 255 138 25); Icon="bar"}
)
for ($i = 0; $i -lt 3; $i++) {
  $x = 118 + $i * 670
  FillRound $x 2865 560 285 18 (Brush (C 255 252 254 255))
  StrokeRound $x 2865 560 285 18 (Pen ($agents[$i].Col) 4)
  DrawCircleIcon $agents[$i].Icon ($x + 88) 2984 $agents[$i].Col
  Text $agents[$i].T (Font 34 "Bold") (Brush ($agents[$i].Col)) (RectF ($x + 165) 2898 345 55) "Near" "Center"
  Text $agents[$i].D (Font 27 "Bold") (Brush (C 255 39 65 105)) (RectF ($x + 165) 2960 355 145) "Near" "Near"
  if ($i -lt 2) { DrawArrow ($x + 590) 3006 ($x + 650) 3006 }
}
Text "数据闭环驱动教学持续优化" (Font 38 "Bold") (Brush (C 255 0 70 160)) (RectF 630 3150 900 62) "Center" "Center"
$g.DrawLine((Pen (C 255 0 70 160) 5), 375, 3182, 600, 3182)
$g.DrawLine((Pen (C 255 0 70 160) 5), 1548, 3182, 1795, 3182)

# 04
SectionTitle "04" "创新点 2  沉浸式 3D 交互" 86 3245 1000
$features = @(
  @{T="自由旋转"; D="多角度观察"; Img=$earthPath},
  @{T="缩放平移"; D="细节清晰呈现"; Img=$heartPath},
  @{T="结构拆解"; D="层级拆分展示"; Img=$diamondPath},
  @{T="透明观察"; D="内部结构透视"; Img=$heartPath},
  @{T="手势控制"; D="自然交互操作"; Img=""}
)
for ($i = 0; $i -lt 5; $i++) {
  $x = 118 + $i * 390
  FillRound $x 3370 340 430 16 (Brush (C 255 241 249 255))
  StrokeRound $x 3370 340 430 16 (Pen (C 120 185 224 255) 2)
  Text $features[$i].T (Font 31 "Bold") (Brush (C 255 0 71 165)) (RectF ($x + 24) 3392 292 42) "Center" "Center"
  Text $features[$i].D (Font 24 "Bold") (Brush (C 255 60 85 126)) (RectF ($x + 24) 3432 292 34) "Center" "Center"
  if ($features[$i].Img -ne "") {
    ImageCrop $features[$i].Img ($x + 65) 3487 210 210 105
  } else {
    DrawCircleIcon "hand" ($x + 170) 3595 (C 255 0 116 230)
  }
  $g.DrawArc((Pen (C 190 0 116 230) 5), $x + 58, 3480, 220, 220, 210, 85)
  $g.DrawArc((Pen (C 190 0 116 230) 5), $x + 58, 3480, 220, 220, 25, 85)
}

# 05
SectionTitle "05" "应用场景" 86 3855 760
$apps = @(
  @{T="课堂教学"; D="提升课堂吸引力与理解度"; Img=$scenePath},
  @{T="科普展示"; D="生动直观，科普效果显著"; Img=$scenePath2},
  @{T="实验演示"; D="复杂过程可视化演示"; Img=$scenePath3},
  @{T="成果汇报"; D="汇报更专业，展示更高效"; Img=$scenePath4}
)
for ($i = 0; $i -lt 4; $i++) {
  $x = 118 + $i * 490
  ImageCrop $apps[$i].Img $x 3975 438 300 18
  $shade = [System.Drawing.Drawing2D.LinearGradientBrush]::new((Rect $x 4168 438 107), (C 0 0 0 0), (C 215 255 255 255), 90)
  FillRound $x 4168 438 107 0 $shade
  $shade.Dispose()
  StrokeRound $x 3975 438 430 18 (Pen (C 145 166 205 242) 3)
  Text $apps[$i].T (Font 36 "Bold") (Brush (C 255 6 70 160)) (RectF ($x + 24) 4240 390 54) "Center" "Center"
  Text $apps[$i].D (Font 25 "Bold") (Brush (C 255 60 85 126)) (RectF ($x + 24) 4288 390 52) "Center" "Center"
}

# Footer
FillRound 90 4460 1980 135 18 (Brush (C 255 252 254 255))
StrokeRound 90 4460 1980 135 18 (Pen (C 140 142 194 255) 3)
$g.DrawLine((Pen (C 130 0 92 190) 3), 168, 4528, 610, 4528)
$g.DrawLine((Pen (C 130 0 92 190) 3), 1550, 4528, 1992, 4528)
$g.FillEllipse((Brush (C 255 0 92 190)), 610, 4519, 18, 18)
$g.FillEllipse((Brush (C 255 0 92 190)), 1532, 4519, 18, 18)
Text "期待与您合作，共创乡村智慧教育新未来" (Font 44 "Bold") (Brush (C 255 0 64 156)) (RectF 455 4488 1250 82) "Center" "Center"

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host $out
