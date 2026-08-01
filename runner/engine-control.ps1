# MFM Broadcast Engine — simple control window (Start / Stop)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$runnerDir  = $PSScriptRoot
$consoleUrl = "https://streamr2.netlify.app/host.html"

$navy = [System.Drawing.Color]::FromArgb(20, 34, 64)
$gold = [System.Drawing.Color]::FromArgb(201, 149, 44)
$green= [System.Drawing.Color]::FromArgb(46, 160, 67)
$fire = [System.Drawing.Color]::FromArgb(232, 93, 38)
$white= [System.Drawing.Color]::White

$form = New-Object System.Windows.Forms.Form
$form.Text = "MFM Broadcast Engine"
$form.Size = New-Object System.Drawing.Size(400, 320)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.BackColor = $navy
try { $form.Icon = New-Object System.Drawing.Icon((Join-Path $PSScriptRoot "mfm.ico")) } catch { }

$title = New-Object System.Windows.Forms.Label
$title.Text = "MFM Broadcast Engine"
$title.ForeColor = $gold
$title.Font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(60, 20)
$form.Controls.Add($title)

$status = New-Object System.Windows.Forms.Label
$status.Text = "Status: stopped"
$status.ForeColor = $white
$status.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$status.AutoSize = $true
$status.Location = New-Object System.Drawing.Point(60, 62)
$form.Controls.Add($status)

$startBtn = New-Object System.Windows.Forms.Button
$startBtn.Text = "Start Engine"
$startBtn.Size = New-Object System.Drawing.Size(270, 48)
$startBtn.Location = New-Object System.Drawing.Point(60, 95)
$startBtn.BackColor = $green
$startBtn.ForeColor = $white
$startBtn.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$startBtn.FlatStyle = "Flat"
$form.Controls.Add($startBtn)

$stopBtn = New-Object System.Windows.Forms.Button
$stopBtn.Text = "Stop Engine"
$stopBtn.Size = New-Object System.Drawing.Size(270, 48)
$stopBtn.Location = New-Object System.Drawing.Point(60, 152)
$stopBtn.BackColor = $fire
$stopBtn.ForeColor = $white
$stopBtn.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$stopBtn.FlatStyle = "Flat"
$form.Controls.Add($stopBtn)

$note = New-Object System.Windows.Forms.Label
$note.Text = "Closing this window does NOT stop the engine — use Stop Engine."
$note.ForeColor = [System.Drawing.Color]::FromArgb(180, 190, 205)
$note.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$note.AutoSize = $true
$note.Location = New-Object System.Drawing.Point(30, 215)
$form.Controls.Add($note)

$startBtn.Add_Click({
    $status.Text = "Status: starting (first run builds a few min)..."
    $form.Refresh()
    Start-Process cmd -ArgumentList ('/k cd /d "' + $runnerDir + '" && docker compose up -d --build')
    Start-Sleep -Seconds 2
    Start-Process $consoleUrl
    $status.Text = "Status: running - wait for 'Cloud engine online' in the console"
    $status.ForeColor = $green
})

$stopBtn.Add_Click({
    $status.Text = "Status: stopping..."
    $form.Refresh()
    Start-Process cmd -ArgumentList ('/c cd /d "' + $runnerDir + '" && docker compose down') -WindowStyle Hidden -Wait
    $status.Text = "Status: stopped"
    $status.ForeColor = $white
})

[void]$form.ShowDialog()
