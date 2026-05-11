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
Set TypingSpeed 60ms
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
Sleep 500ms
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
Sleep 500ms
Up
Sleep 500ms
Enter
Sleep 1.5s

# Prompt: Monorepo tool (turbo is first option)
Enter
Sleep 1.5s

# Prompt: Lint tool (biome is first option)
Enter
Sleep 1.5s

# Prompt: Format tool (biome is first option)
Enter
Sleep 1.5s

# Prompt: Test framework (vitest is first option)
Enter
Sleep 1.5s

# Prompt: Confirm creation (browse then confirm)
Right
Sleep 500ms
Left
Sleep 500ms
Enter
Sleep 3s

Right
Sleep 500ms
Left
Sleep 500ms
Enter
Sleep 3s

Right
Sleep 500ms
Left
Sleep 500ms
Enter
Sleep 5s

# Show the generated config
Type "cat $TMP_REPO/stack.effect.json"
Enter
Sleep 2s

# ============================================================
# --- Add Command: add chat module to a server target ---
# ============================================================
Sleep 1s

# Run the add command
Type "stack-effect add --root $TMP_REPO"
Sleep 1s
Enter
Sleep 2s

# Prompt: Target kind selection (HorizontalSelect)
# Options: client, server, package (adjust arrows to land on "server")
Right
Sleep 500ms
Enter
Sleep 1.5s

# Prompt: Target name
Type "api"
Sleep 1s
Enter
Sleep 1.5s

# Prompt: Module selection (multiSelect - select chat-server)
# Navigate to chat-server and toggle with Space
Down
Sleep 400ms
Down
Sleep 400ms
Space
Sleep 500ms
Enter
Sleep 2s

# Prompt: Implication resolution - domain-chat needs a package target name
# (auto-prompted: "Module chat-server requires a package target. What should it be called?")
Type "domain"
Sleep 1s
Enter
Sleep 1.5s

# Prompt: Action selection (HorizontalSelect: Confirm all / Edit modules / Add target)
# Select "Confirm all"
Enter
Sleep 2s

# Prompt: Blueprint confirmation ("Continue with these changes?")
Enter
Sleep 2s

# Prompt: Apply confirmation ("Apply changes?")
Enter
Sleep 5s

# Show result
Sleep 2s

# Final pause
Sleep 3s
