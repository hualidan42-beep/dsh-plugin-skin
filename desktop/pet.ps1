#requires -Version 5.1
<#
  桌面桌宠（Windows / WPF）

  她是一个独立进程：DSH 页面关掉、最小化、切到别的应用，她都在桌面上。
  与 DSH 之间只通过两个 JSON 文件通信，没有网络、没有鉴权：

    pet-config.json   → 宿主写、这里读（名字 / 大小 / 素材目录）
    pet-status.json   → 浏览器端说一句、宿主写、这里每秒轮询

  为什么不直接用 WebView 里那套 DOM：那样 DSH 一关她就没了，正是用户
  明确不要的效果。所以这里只有 WPF：透明窗口 + PNG 帧 + 气泡，零依赖。
#>

param(
  [string]$Config = (Join-Path $env:USERPROFILE ".dsh-skin\pet-config.json"),
  # 只渲染一张版式预览图然后退出（给 verify / 排查用；正常运行不要传）
  [string]$RenderTest = ""
)

$ErrorActionPreference = "Stop"
$logFile = Join-Path $env:TEMP "dsh-skin-pet.log"

function Write-Log([string]$message) {
  try {
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  } catch { }
}

# 启动面包屑（2026-11-02 晚加的排查设施）
#
# 宿主 spawn 过来的子进程如果「一起来就没了」，日志可能一行都没有 —— 分不清是
# 「根本没跑到」还是「跑到一半死了」。所以每一步都落一颗面包屑，并且同时往四个
# 可能可写的位置写：插件目录（工作区，宿主可写）、%TEMP%、用户主目录、工作区临时目录。
# 只要能拿到其中一颗，就知道死在哪一步；一颗都没有，说明进程在执行脚本之前就没了。
$crumbTargets = @(
  (Join-Path $PSScriptRoot "last-boot.log"),
  (Join-Path $env:TEMP "dsh-skin-pet-boot.log"),
  (Join-Path $env:USERPROFILE ".dsh-skin\boot.log"),
  (Join-Path ([System.IO.Path]::GetTempPath()) "dsh-skin-pet-boot.log")
)
function Write-Crumb([string]$step, [string]$extra = "") {
  $line = "{0} [{1}] pid={2} {3}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $step, $PID, $extra
  foreach ($target in $crumbTargets) {
    try {
      $dir = Split-Path -Parent $target
      if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
      [System.IO.File]::AppendAllText($target, $line + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
    } catch { }
  }
}
Write-Crumb "script-start" ("user={0} temp={1} psver={2} cwd={3}" -f $env:USERNAME, $env:TEMP, $PSVersionTable.PSVersion, (Get-Location))

try {
  Add-Type -AssemblyName PresentationFramework
  Add-Type -AssemblyName PresentationCore
  Add-Type -AssemblyName WindowsBase
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  Write-Crumb "wpf-loaded"
} catch {
  Write-Crumb "wpf-failed" $_.Exception.Message
  Write-Log "加载 WPF 失败：$($_.Exception.Message)"
  throw
}

# ── 单实例锁 ─────────────────────────────────────────────────────────────────
#
# 她是个 detached 进程：宿主重启丢了句柄、面板连点两下、或者有人手动又跑一遍脚本，
# 都可能再起一个 —— 桌面上就会并排站两只。宿主那边有 pid 文件挡一道，但那道只能挡
# 「同一个宿主」，挡不住「文件丢了 / 手动再跑」。
# 这里用命名互斥体兜底：后来者直接退出，不在桌面上再养一只。
$petMutex = New-Object System.Threading.Mutex($false, "Local\dsh-skin-desktop-pet")
$gotLock = $false
try {
  $gotLock = $petMutex.WaitOne(0)
} catch [System.Threading.AbandonedMutexException] {
  # 上一个持有者是被杀掉的（没正常释放）—— 锁现在归我们
  $gotLock = $true
}
if (-not $gotLock) {
  Write-Crumb "mutex-busy"
  Write-Log "已经有一只桌宠在跑，这次不再启动（单实例锁）"
  exit 0
}
Write-Crumb "mutex-ok"

# ── 配置 ─────────────────────────────────────────────────────────────────────
if (-not (Test-Path -LiteralPath $Config)) {
  Write-Crumb "config-missing" $Config
  Write-Log "找不到配置文件：$Config"
  exit 1
}
$cfg = Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json
$size = 160
if ($cfg.size) { $size = [int]$cfg.size }
if ($size -lt 72) { $size = 160 }
if ($size -gt 260) { $size = 260 }
$petName = if ($cfg.name) { [string]$cfg.name } else { "小蓝" }
$prefix = if ($cfg.prefix) { [string]$cfg.prefix } else { "pet-starlight" }
$assetDir = if ($cfg.assetDir) { [string]$cfg.assetDir } else { Join-Path $PSScriptRoot "..\assets" }
$statusFile = if ($cfg.statusFile) { [string]$cfg.statusFile } else { Join-Path $env:USERPROFILE ".dsh-skin\pet-status.json" }
$windowFile = if ($cfg.windowFile) { [string]$cfg.windowFile } else { Join-Path $env:USERPROFILE ".dsh-skin\pet-window.json" }
Write-Crumb "config-ok" ("name={0} size={1} assetDir={2} status={3}" -f $petName, $size, $assetDir, $statusFile)

# ── 自己登记 pid ─────────────────────────────────────────────────────────────
#
# 谁起的她不一定可靠：面板按钮要宿主 spawn，宿主在某些环境下起不了进程；
# 双击 start-pet.cmd 起的话，宿主根本不知道她的 pid。
# 所以她自己把 {pid} 写进运行时目录，宿主读这个文件就能知道「在跑 / 跑的是哪个」。
# 写不进去也不影响她自己活着（只是面板会显示未启动）。
$pidFile = Join-Path (Split-Path -Parent $statusFile) "pet.pid"
try {
  $dir = Split-Path -Parent $pidFile
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($pidFile, (@{ pid = $PID; at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
  Write-Crumb "pid-file" $pidFile
} catch {
  Write-Crumb "pid-file-failed" $_.Exception.Message
}
function Remove-PidFile {
  try {
    if (-not (Test-Path -LiteralPath $pidFile)) { return }
    $raw = Get-Content -LiteralPath $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json
    # 只删自己写的：别的情形的 pid 文件不归这次运行管
    if ([int]$raw.pid -eq $PID) { Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue }
  } catch { }
}
function Save-ClosedMarker {
  # 留下「是我自己关的」这条痕迹。
  # 为什么要它：宿主一重启，走 subprocess 起的桌宠会被 job 一起收掉，pid 文件也一样是死的。
  # 面板没法区分「被系统收走」和「用户右键退出」，只能一律再拉起来 —— 那用户刚关掉的宠物
  # 就会自己回来。写一个关闭时间戳，面板见过它就不再自动拉起，直到用户再点一次「放到桌面」。
  try {
    if (-not $pidFile) { return }
    $closedFile = Join-Path (Split-Path -Parent $pidFile) "pet-closed.json"
    [System.IO.File]::WriteAllText($closedFile, (@{ at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); pid = $PID } | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
    Write-Crumb "closed-marker" $closedFile
  } catch {
    Write-Crumb "closed-marker-failed" $_.Exception.Message
  }
}

$global:LastStatusAt = 0
$global:Dragging = $false
$global:DragMoved = $false
$global:HideTimer = $null
$global:MoodTimer = $null

function Get-FramePath([string]$mood) {
  $candidate = Join-Path $assetDir ("pet-desktop-{0}.png" -f $mood)
  if (Test-Path -LiteralPath $candidate) { return $candidate }
  $fallback = Join-Path $assetDir "pet-desktop-idle.png"
  if (Test-Path -LiteralPath $fallback) { return $fallback }
  # 最后再退一步：用浏览器端那份 webp（WPF 多半解不了，但至少路径是对的，日志里能看出来）
  return (Join-Path $assetDir ("{0}-idle.webp" -f $prefix))
}

# ── 窗口 ─────────────────────────────────────────────────────────────────────
$win = New-Object System.Windows.Window
$win.WindowStyle = [System.Windows.WindowStyle]::None
$win.AllowsTransparency = $true
# 背景必须是 $null 而不是 Transparent：Transparent 会让整块矩形都参与命中测试，
# 于是那圈看不见的留白会把桌面点击全吃掉（点了图标没反应，很难想到是桌宠干的）。
$win.Background = $null
$win.Topmost = $true
$win.ShowInTaskbar = $false
$win.ShowActivated = $false
$win.ResizeMode = [System.Windows.ResizeMode]::NoResize
$win.Title = "DSH 桌宠 · $petName"
$win.SnapsToDevicePixels = $true
# 气泡区 76px + 桌宠本体：气泡贴着头的上方，不悬在半空
$bubbleHeight = 76
$petWidth = [Math]::Round($size * 0.825)
$win.Width = [Math]::Max(268, $petWidth + 24)
$win.Height = $size + $bubbleHeight

$grid = New-Object System.Windows.Controls.Grid
$rowBubble = New-Object System.Windows.Controls.RowDefinition
$rowBubble.Height = New-Object System.Windows.GridLength(1, [System.Windows.GridUnitType]::Star)
$rowPet = New-Object System.Windows.Controls.RowDefinition
$rowPet.Height = New-Object System.Windows.GridLength(0, [System.Windows.GridUnitType]::Auto)
$grid.RowDefinitions.Add($rowBubble)
$grid.RowDefinitions.Add($rowPet)
$win.Content = $grid
Write-Crumb "window-shell" ("win={0}x{1}" -f [Math]::Round($win.Width), [Math]::Round($win.Height))

# 气泡：就一块圆角 Border + 一个自动换行的 TextBlock
$bubble = New-Object System.Windows.Controls.Border
$bubble.CornerRadius = New-Object System.Windows.CornerRadius(14)
$bubble.Background = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.ColorConverter]::ConvertFromString("#F5FFFDF7"))
$bubble.BorderBrush = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.ColorConverter]::ConvertFromString("#33FFFFFF"))
$bubble.BorderThickness = New-Object System.Windows.Thickness(1)
$bubble.Padding = New-Object System.Windows.Thickness(11, 8, 11, 8)
$bubble.Margin = New-Object System.Windows.Thickness(0, 0, 6, 2)
$bubble.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
# Bottom 而不是 Top：气泡要贴着头的上方，不能悬在窗口顶部留出一道空档
$bubble.VerticalAlignment = [System.Windows.VerticalAlignment]::Bottom
$bubble.MaxWidth = 250
$bubble.Visibility = [System.Windows.Visibility]::Collapsed
$bubble.Effect = New-Object System.Windows.Media.Effects.DropShadowEffect -Property @{
  Color = [System.Windows.Media.ColorConverter]::ConvertFromString("#44000000")
  BlurRadius = 14
  ShadowDepth = 2
  Opacity = 0.55
}

$bubbleText = New-Object System.Windows.Controls.TextBlock
$bubbleText.TextWrapping = [System.Windows.TextWrapping]::Wrap
$bubbleText.FontFamily = New-Object System.Windows.Media.FontFamily("Microsoft YaHei UI, Segoe UI, sans-serif")
$bubbleText.FontSize = 12.5
$bubbleText.FontWeight = [System.Windows.FontWeights]::SemiBold
$bubbleText.Foreground = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.ColorConverter]::ConvertFromString("#FF3B3330"))
$bubble.Child = $bubbleText
[System.Windows.Controls.Grid]::SetRow($bubble, 0)
$grid.Children.Add($bubble) | Out-Null

$image = New-Object System.Windows.Controls.Image
$image.Stretch = [System.Windows.Media.Stretch]::Uniform
$image.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
$image.VerticalAlignment = [System.Windows.VerticalAlignment]::Bottom
$image.Height = $size
$image.Margin = New-Object System.Windows.Thickness(0, 0, 4, 0)
$image.RenderTransformOrigin = New-Object System.Windows.Point(0.5, 1)
$scale = New-Object System.Windows.Media.ScaleTransform(1, 1)
$image.RenderTransform = $scale
[System.Windows.Controls.Grid]::SetRow($image, 1)
$grid.Children.Add($image) | Out-Null

function Set-PetFrame([string]$mood) {
  $path = Get-FramePath $mood
  try {
    $bitmap = New-Object System.Windows.Media.Imaging.BitmapImage
    $bitmap.BeginInit()
    $bitmap.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
    $bitmap.UriSource = New-Object System.Uri($path, [System.UriKind]::Absolute)
    $bitmap.EndInit()
    $bitmap.Freeze()
    $image.Source = $bitmap
  } catch {
    Write-Log "载入帧失败（$mood）：$($_.Exception.Message)"
  }
}
Set-PetFrame "idle"

# 呼吸：只改 ScaleTransform，不碰布局（透明窗口上做布局动画会抖）
$breath = New-Object System.Windows.Media.Animation.DoubleAnimation
$breath.From = 1.0
$breath.To = 1.028
$breath.Duration = New-Object System.Windows.Duration([TimeSpan]::FromSeconds(1.5))
$breath.AutoReverse = $true
$breath.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
$breath.EasingFunction = New-Object System.Windows.Media.Animation.SineEase -Property @{ EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseInOut }
$scale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleYProperty, $breath)
$scale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleXProperty, $breath)

# ── 说话 ─────────────────────────────────────────────────────────────────────
# 桌面端自己的碎句：不联网时也得能回一句，否则「右键→说句话」是个死按钮。
$localLines = @(
  "我在呢",
  "要不要歇一会儿",
  "桌面我也在哦",
  "别忘了喝水",
  "刚忙完？伸个懒腰吧",
  "这个窗口我认得",
  "叫我做什么呀",
  "我就在这儿待着"
)

function Show-Line([string]$text, [string]$mood) {
  if ([string]::IsNullOrWhiteSpace($text)) { return }
  $bubbleText.Text = [string]$text
  $preview = [string]$text
  if ($preview.Length -gt 40) { $preview = $preview.Substring(0, 40) }
  Write-Log ("说话 mood={0} text={1}" -f $mood, $preview)
  $bubble.Visibility = [System.Windows.Visibility]::Visible
  $bubble.Opacity = 0
  $fade = New-Object System.Windows.Media.Animation.DoubleAnimation
  $fade.From = 0.0
  $fade.To = 1.0
  $fade.Duration = New-Object System.Windows.Duration([TimeSpan]::FromMilliseconds(160))
  $bubble.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $fade)

  if ($mood -and $mood -ne "idle") { Set-PetFrame $mood }

  if ($null -ne $global:HideTimer) { $global:HideTimer.Stop() }
  $global:HideTimer = New-Object System.Windows.Threading.DispatcherTimer
  $global:HideTimer.Interval = [TimeSpan]::FromSeconds(6)
  $global:HideTimer.Add_Tick({
    $global:HideTimer.Stop()
    $bubble.Visibility = [System.Windows.Visibility]::Collapsed
  })
  $global:HideTimer.Start()

  if ($null -ne $global:MoodTimer) { $global:MoodTimer.Stop() }
  $global:MoodTimer = New-Object System.Windows.Threading.DispatcherTimer
  $global:MoodTimer.Interval = [TimeSpan]::FromSeconds(7)
  $global:MoodTimer.Add_Tick({
    $global:MoodTimer.Stop()
    Set-PetFrame "idle"
  })
  $global:MoodTimer.Start()
}

# ── 位置：记住上次在哪儿，第一次开就落在右下角 ──────────────────────────────
function Get-WorkArea {
  $area = [System.Windows.SystemParameters]::WorkArea
  return @{ Left = $area.Left; Top = $area.Top; Right = $area.Right; Bottom = $area.Bottom }
}

function Set-DefaultPosition {
  $area = Get-WorkArea
  $win.Left = $area.Right - $win.Width - 28
  $win.Top = $area.Bottom - $win.Height - 12
}

function Restore-Position {
  if (Test-Path -LiteralPath $windowFile) {
    try {
      $saved = Get-Content -LiteralPath $windowFile -Raw -Encoding UTF8 | ConvertFrom-Json
      $left = [double]$saved.left
      $top = [double]$saved.top
      $area = Get-WorkArea
      # 上次可能在副屏、或者分辨率变了：夹回工作区内，不然窗口会开在看不见的地方
      $left = [Math]::Max($area.Left, [Math]::Min($left, $area.Right - 80))
      $top = [Math]::Max($area.Top, [Math]::Min($top, $area.Bottom - 60))
      $win.Left = $left
      $win.Top = $top
      return
    } catch {
      Write-Log "位置读取失败，用默认位置：$($_.Exception.Message)"
    }
  }
  Set-DefaultPosition
}

function Save-Position {
  try {
    $dir = Split-Path -Parent $windowFile
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $payload = @{ left = [Math]::Round($win.Left); top = [Math]::Round($win.Top) } | ConvertTo-Json -Compress
    Set-Content -LiteralPath $windowFile -Value $payload -Encoding UTF8
  } catch {
    Write-Log "位置保存失败：$($_.Exception.Message)"
  }
}

# ── 交互：拖、戳、右键 ───────────────────────────────────────────────────────
$global:DragStartX = 0
$global:DragStartY = 0
$global:WinStartLeft = 0
$global:WinStartTop = 0

$win.Add_MouseLeftButtonDown({
  $global:Dragging = $true
  $global:DragMoved = $false
  $global:DragStartX = $win.Left
  $global:DragStartY = $win.Top
  $win.DragMove()
})
$win.Add_MouseLeftButtonUp({
  if (-not $global:Dragging) { return }
  $global:Dragging = $false
  $moved = ([Math]::Abs($win.Left - $global:DragStartX) + [Math]::Abs($win.Top - $global:DragStartY)) -gt 4
  if ($moved) {
    Save-Position
    Show-Line "放到这儿啦" "happy"
  } else {
    Show-Line ($localLines | Get-Random) $(@("shy", "sulk", "happy") | Get-Random)
  }
})

$menu = New-Object System.Windows.Controls.ContextMenu
$itemSay = New-Object System.Windows.Controls.MenuItem
$itemSay.Header = "说句话"
$itemSay.Add_Click({ Show-Line ($localLines | Get-Random) $(@("shy", "happy") | Get-Random) })
$itemHome = New-Object System.Windows.Controls.MenuItem
$itemHome.Header = "回到右下角"
$itemHome.Add_Click({ Set-DefaultPosition; Save-Position; Show-Line "回来了" "happy" })
$itemQuit = New-Object System.Windows.Controls.MenuItem
$itemQuit.Header = "退出桌宠"
$itemQuit.Add_Click({ $win.Close() })
$menu.Items.Add($itemSay) | Out-Null
$menu.Items.Add($itemHome) | Out-Null
$menu.Items.Add((New-Object System.Windows.Controls.Separator)) | Out-Null
$menu.Items.Add($itemQuit) | Out-Null
$win.ContextMenu = $menu

# ── 状态轮询：DSH 说一句，这里就说一句 ───────────────────────────────────────
#
# 启动时先把「文件里已有的那条」记下来但**不念**：那是上一次会话留下的话，
# 一开机就复述一遍像是刚发生的事，会让人以为任务又跑完了。
if (Test-Path -LiteralPath $statusFile) {
  try {
    $bootStatus = Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($bootStatus.at) { $global:LastStatusAt = [double]$bootStatus.at }
  } catch {
    $global:LastStatusAt = 0
  }
}

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(1000)
$timer.Add_Tick({
  if (-not (Test-Path -LiteralPath $statusFile)) { return }
  try {
    $raw = Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) { return }
    $status = $raw | ConvertFrom-Json
    $at = [double]$status.at
    if ($at -le $global:LastStatusAt) { return }
    $global:LastStatusAt = $at
    Show-Line ([string]$status.line) ([string]$status.mood)
  } catch {
    # 宿主正在写文件时会读到半截 JSON，下一拍再来，不写日志刷屏
  }
})
$timer.Start()

# ── 启动 ─────────────────────────────────────────────────────────────────────
$win.Add_Loaded({
  Restore-Position
  Save-Position
  # 一行把所有几何信息写进日志：出问题时不用猜是「没渲染」还是「开在屏幕外」
  $frameInfo = "none"
  try {
    if ($image.Source -is [System.Windows.Media.Imaging.BitmapSource]) {
      $frameInfo = "{0}x{1}" -f $image.Source.PixelWidth, $image.Source.PixelHeight
    }
  } catch { }
  $wa = Get-WorkArea
  Write-Crumb "shown" ("at={0},{1} wa={2}x{3} frame={4}" -f [Math]::Round($win.Left), [Math]::Round($win.Top), [Math]::Round($wa.Right - $wa.Left), [Math]::Round($wa.Bottom - $wa.Top), $frameInfo)
  Write-Log ("窗口已显示 size={0} name={1} frame={2} win={3}x{4} at={5},{6} wa={7}x{8} status={9}" -f `
    $size, $petName, $frameInfo, [Math]::Round($win.Width), [Math]::Round($win.Height), `
    [Math]::Round($win.Left), [Math]::Round($win.Top), `
    [Math]::Round($wa.Right - $wa.Left), [Math]::Round($wa.Bottom - $wa.Top), $statusFile)
  Show-Line "我来啦，$petName 在桌面上陪着你" "happy"

  if ($RenderTest) {
    # 屏幕截图抓不到分层窗口（透明窗口不进 BitBlt），所以验证版式只能靠
    # 窗口把自己渲染成一张 PNG。这条路径也顺手给用户留了个「桌面端长什么样」的预览图。
    try {
      $win.UpdateLayout()
      $bubble.Visibility = [System.Windows.Visibility]::Visible
      $bubble.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $null)
      $bubble.Opacity = 1
      $rw = [int][Math]::Ceiling($win.ActualWidth)
      $rh = [int][Math]::Ceiling($win.ActualHeight)
      if ($rw -lt 1) { $rw = [int]$win.Width }
      if ($rh -lt 1) { $rh = [int]$win.Height }
      $rtb = New-Object System.Windows.Media.Imaging.RenderTargetBitmap($rw, $rh, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
      $rtb.Render($win)
      $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
      $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($rtb))
      $stream = [System.IO.File]::Open($RenderTest, [System.IO.FileMode]::Create)
      $encoder.Save($stream)
      $stream.Close()
      Write-Log "自渲染完成：$RenderTest ($rw x $rh)"
    } catch {
      Write-Log "自渲染失败：$($_.Exception.Message)"
    }
    $win.Close()
    return
  }
})
$win.Add_Closed({ $timer.Stop(); Write-Crumb "closed"; Remove-PidFile; Save-ClosedMarker; Write-Log "窗口已关闭" })

Write-Crumb "showdialog"
try {
  [void]$win.ShowDialog()
} catch {
  Write-Crumb "showdialog-failed" $_.Exception.Message
  Write-Log "运行失败：$($_.Exception.Message)"
  throw
} finally {
  Remove-PidFile
  Save-ClosedMarker
}
Write-Crumb "exit-normal"
Write-Log "进程退出"
