# Render the matching vector design at high resolution, then downsample for the toolbar.
Add-Type -AssemblyName System.Drawing
$iconRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/icons'))
function RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}
function FillRounded($graphics, $brush, $x, $y, $width, $height, $radius, $pen = $null) {
  $shape = RoundedPath $x $y $width $height $radius
  $graphics.FillPath($brush, $shape)
  if ($pen) { $graphics.DrawPath($pen, $shape) }
  $shape.Dispose()
}
$bitmap = [Drawing.Bitmap]::new(512, 512)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.ScaleTransform(4, 4)
$edge = [Drawing.ColorTranslator]::FromHtml('#536257')
$dark = [Drawing.SolidBrush]::new($edge)
$outline = [Drawing.Pen]::new($edge, 3)
$silver = [Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.Rectangle]::new(7, 8, 114, 107), [Drawing.ColorTranslator]::FromHtml('#edf0e6'), [Drawing.ColorTranslator]::FromHtml('#929f90'), 65)
$glass = [Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.Rectangle]::new(21, 22, 86, 67), [Drawing.ColorTranslator]::FromHtml('#204b38'), [Drawing.ColorTranslator]::FromHtml('#091d15'), 75)
$bezel = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#46564a'))
$screenEdge = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#14291d'), 2)
$green = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#a9f39a'))
$thinEdge = [Drawing.Pen]::new($edge, 1)
$vent = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#657468'), 2)
$shine = [Drawing.Pen]::new([Drawing.Color]::FromArgb(38, 255, 255, 255), 3)
FillRounded $graphics $dark 23 113 22 7 3
FillRounded $graphics $dark 83 113 22 7 3
FillRounded $graphics $silver 7 8 114 107 18 $outline
FillRounded $graphics $bezel 16 17 96 77 16
FillRounded $graphics $glass 21 22 86 67 13 $screenEdge
$triangle = [Drawing.PointF[]]@([Drawing.PointF]::new(56, 39), [Drawing.PointF]::new(79, 55), [Drawing.PointF]::new(56, 71))
$graphics.FillPolygon($green, $triangle)
$graphics.DrawLine($shine, 30, 32, 45, 32)
$graphics.FillEllipse($green, 23, 100, 6, 6)
$graphics.DrawEllipse($thinEdge, 23, 100, 6, 6)
$graphics.DrawLine($vent, 81, 101, 102, 101)
$graphics.DrawLine($vent, 81, 105, 102, 105)
$graphics.Dispose()
foreach ($size in @(16, 32, 48, 128, 256)) {
  $output = [Drawing.Bitmap]::new($size, $size)
  $resizer = [Drawing.Graphics]::FromImage($output)
  $resizer.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $resizer.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $resizer.DrawImage($bitmap, 0, 0, $size, $size)
  $output.Save((Join-Path $iconRoot "icon-$size.png"), [Drawing.Imaging.ImageFormat]::Png)
  $resizer.Dispose()
  $output.Dispose()
}
$bitmap.Dispose()
foreach ($resource in @($dark, $outline, $silver, $glass, $bezel, $screenEdge, $green, $thinEdge, $vent, $shine)) { $resource.Dispose() }
