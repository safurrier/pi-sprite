Output demos/wendybot3000/wendybot3000.gif

Set FontSize 18
Set Width 1400
Set Height 820
Set FontFamily "Menlo"
Set LetterSpacing 0
Set LineHeight 1.2
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 20ms
Set PlaybackSpeed 1
Set Shell "bash"
Set WindowBar "Colorful"

Type@0ms "cd $(pwd) && source demos/wendybot3000/setup-pi-demo.sh && tmux -S $PI_SPRITE_DEMO_SOCKET attach-session -t $PI_SPRITE_DEMO_SESSION"
Enter
Sleep 3500ms

Type "/pet import /tmp/pi-sprite-wendybot3000-demo/wendybot3000-sprite"
Enter
Sleep 1600ms
Type "/pet choose wendybot3000"
Enter
Sleep 1200ms
Type "/pet align right"
Enter
Sleep 900ms
Type "/pet label off"
Enter
Sleep 900ms
Type "/pet size small"
Enter
Sleep 900ms
Type "/pet show"
Enter
Sleep 1200ms
Type "/pet status"
Enter
Sleep 1800ms
Type "Fix demo sprite"
Enter
Sleep 4200ms

Type "/context"
Enter
Sleep 4200ms
Escape
Sleep 900ms

Type "/btw what should we verify before publishing this package?"
Enter
Sleep 5200ms
Escape
Sleep 900ms

Type "/recap"
Enter
Sleep 5200ms
Escape
Sleep 700ms
Ctrl+B
Sleep 100ms
Type "d"
Sleep 700ms
Type@0ms "tmux -S $PI_SPRITE_DEMO_SOCKET kill-server"
Enter
Sleep 300ms
