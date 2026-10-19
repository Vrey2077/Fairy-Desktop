$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  Add-Type -AssemblyName System.Speech
  $speechInput = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
  if ($speechInput.action -eq 'voices') {
    $voiceItems = @($synth.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { @{id=$_.VoiceInfo.Name;name=$_.VoiceInfo.Name;language=$_.VoiceInfo.Culture.Name} })
    [Console]::Write((@{voices=$voiceItems} | ConvertTo-Json -Compress -Depth 4))
  } else {
    if ($speechInput.voiceId) { $synth.SelectVoice([string]$speechInput.voiceId) }
    else {
      $chineseVoice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'zh-*' } | Select-Object -First 1
      if ($chineseVoice) { $synth.SelectVoice($chineseVoice.VoiceInfo.Name) }
    }
    $synth.Rate = [Math]::Max(-10,[Math]::Min(10,[int](($speechInput.rate - 1) * 8)))
    $synth.Volume = 100
    $waveStream = [IO.MemoryStream]::new()
    $synth.SetOutputToWaveStream($waveStream)
    $synth.Speak([string]$speechInput.text)
    $synth.SetOutputToNull()
    [Console]::Write((@{audio=[Convert]::ToBase64String($waveStream.ToArray())} | ConvertTo-Json -Compress))
    $waveStream.Dispose()
  }
  $synth.Dispose()
} catch {
  [Console]::Write('{"error":"系统语音不可用，请检查 Windows 语音包。"}')
  exit 1
}
