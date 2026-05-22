# VHS Demo: stack-effect init command
# Demonstrates the interactive project initialization flow

# --- Dependencies ---
Require bun

# --- Configuration ---
Output media/nestselect.gif
Set Shell "zsh"
Set FontSize 16
Set Width 1100
Set Height 500
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
Sleep 300ms

# Run the init command
Type "stack-effect init . --root $TMP_REPO -y"
Enter
Sleep 5s
Type "clear" Enter
Sleep 300ms
Show

# --- Demo Start ---
Sleep 1s

# Run the add command
Type "stack-effect add --root $TMP_REPO"
Sleep 1s
Enter
Sleep 1.5s

# Prompt: Target kind selection (HorizontalSelect)
# Options: client-react, client-foldkit, server, package (adjust arrows to land on "server")
Enter
Sleep 1.5s

# Prompt: Target name
Enter
Sleep 1.5s

Set TypingSpeed 130ms

# Prompt: Module selection (multiSelect - select chat-server)
# Navigate to chat-server and toggle with Space
Down 2
Sleep 300ms
Up 2
Sleep 300ms
Space
Sleep 600ms
Space
Sleep 300ms
Down 2
Sleep 300ms
Space
Sleep 300ms
Down 6
Sleep 300ms
Space
Sleep 300ms
Up 7
Sleep 300ms
Space
Sleep 300ms
Down 5
Sleep 300ms
Up 3
Sleep 2s


# Show result
Sleep 10s

# Final pause
Sleep 1.5s
