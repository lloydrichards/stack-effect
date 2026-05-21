# VHS Demo: stack-effect init command
# Demonstrates the interactive project initialization flow

# --- Dependencies ---
Require bun

# --- Configuration ---
Output media/init-demo.gif
Set Shell "zsh"
Set FontSize 16
Set Width 1350
Set Height 600
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
Type "stack-effect init --root $TMP_REPO"
Enter
Sleep 2s

# Prompt: Project name
Type "my-awesome-app"
Sleep 1s
Enter
Sleep 1.5s

# Prompt: Runtime selection (browse options then select bun)
Down
Up
Sleep 300ms
Enter
Sleep 1.5s

# Prompt: Monorepo tool (turbo is first option)
Down
Up
Sleep 300ms
Enter
Sleep 1.5s

# Prompt: Lint tool (biome is first option)
Down
Up
Sleep 300ms
Enter
Sleep 1.5s

# Prompt: Format tool (biome is first option)
Down
Up
Sleep 300ms
Enter
Sleep 1.5s

# Prompt: Test framework (vitest is first option)
Enter
Sleep 1.5s

# Prompt: Git initialization
Right
Left
Sleep 300ms
Enter
Sleep 1.5s

# Prompt: Confirm creation (browse then confirm)
Right
Left
Sleep 300ms
Enter
Sleep 1.5s

Right
Left
Sleep 300ms
Enter
Sleep 1.5s

Right
Left
Sleep 300ms
Enter
Sleep 5s

# Prompt: Finalize confirmation
Down 2
Up 2
Enter
Sleep 10s

# Show the generated config
Enter 2
Type "cat $TMP_REPO/my-awesome-app/stack.effect.json"
Enter
Sleep 2s

# ============================================================
# --- Add Command: add chat module to a server target ---
# ============================================================
Sleep 1s

# Run the add command
Enter 2
Type "stack-effect add --root $TMP_REPO/my-awesome-app"
Sleep 1s
Enter
Sleep 1.5s

# Prompt: Target kind selection (HorizontalSelect)
# Options: client, server, package (adjust arrows to land on "server")
Right 2
Sleep 300ms
Enter
Sleep 1.5s

# Prompt: Target name
Type "api"
Sleep 1s
Enter
Sleep 1.5s

# Prompt: Module selection (multiSelect - select chat-server)
# Navigate to chat-server and toggle with Space
Down 2
Space
Sleep 300ms
Enter
Sleep 2s

# Prompt: Action selection (HorizontalSelect: Confirm all / Edit modules / Add target)
# Select "Confirm all"
Right 2
Left 2
Sleep 300ms
Enter
Sleep 2s

# Prompt: Blueprint confirmation ("Continue with these changes?")
Down 10
Up 5
Down 10
Sleep 300ms
Right
Left
Sleep 300ms
Enter
Sleep 2s

# Prompt: Apply confirmation ("Apply changes?")
Down 10
Up 5
Down 10
Sleep 300ms
Right
Left
Sleep 300ms
Enter
Sleep 2s

# Prompt: Finalize confirmation
Down 2
Up 2
Enter
Sleep 10s

# Show result
Sleep 2s

# Final pause
Sleep 1.5s
