$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speechRoot = Split-Path -Parent $PSScriptRoot
$speechFile = Join-Path $speechRoot 'tmp/speech.wav'
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$english = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1
if ($english) { $synth.SelectVoice($english.VoiceInfo.Name) }
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile($speechFile, $format)
$synth.Speak('How would you design a database transaction to handle concurrent payment requests?')
$synth.Dispose()
python -c "import wave,struct; w=wave.open('tmp/speech.wav'); b=w.readframes(w.getnframes()); s=struct.unpack('<'+'h'*(len(b)//2),b); open('tmp/speech.f32','wb').write(struct.pack('<'+'f'*len(s),*[v/32768 for v in s])); print(w.getparams())"
