# VHS Demo: stack-effect init command
# Demonstrates the interactive project initialization flow

# --- Dependencies ---
Require bun

# --- Configuration ---
Output media/foldkit-demo.gif
Set Shell "zsh"
Set FontSize 16
Set Width 1800
Set Height 1400
Set TypingSpeed 100ms
Set WindowBar Colorful
Set Padding 20

# --- Setup: create a temp directory ---
Hide
Type "export TMP_REPO=$(mktemp -d)" Enter
Sleep 300ms
Type "cd apps/cli" Enter
Sleep 300ms
Type "alias stack-effect='bun run start --'" Enter
Sleep 300ms
Type "clear" Enter
Sleep 300ms
Show

# --- Demo Start ---
Sleep 1s

# Run the init command
Type "stack-effect init fullstack-foldkit --root $TMP_REPO -y"
Enter
Sleep 5s

# Show the generated config
Enter 2
Type "cat $TMP_REPO/fullstack-foldkit/stack.effect.json"
Enter
Sleep 2s

# ============================================================
# --- Add Command: add chat module to a server target ---
# ============================================================
Sleep 1s

# Run the add command
Enter 2
Type "stack-effect add --root $TMP_REPO/fullstack-foldkit --dry-run"
Sleep 1s
Enter
Sleep 1.5s

# Prompt: Target kind selection (HorizontalSelect)
# Options: client-react, client-foldkit, server, package (adjust arrows to land on "client-foldkit")
Right
Sleep 300ms
Enter
Sleep 1.5s

# Prompt: Target name (skip)
Enter
Sleep 1.5s

# Prompt: Module selection (multiSelect - select chat-server)
# Navigate to chat-server and toggle with Space
Down 3
Space
Sleep 300ms
Enter
Sleep 1s

# Prompt: Target name (skip)
Enter
Sleep 2s

# Prompt: Action selection (HorizontalSelect: Confirm all / Edit modules / Add target)
# Select "Confirm all"
Sleep 300ms
Enter
Sleep 2s

# Show result
Sleep 2s

# Final pause
Sleep 1.5s
