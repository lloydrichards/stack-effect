---
"stack-effect": minor
---

init now creates a subdirectory from the project name

The 'init' command uses the positional name to create and write into a subdirectory, and '.' initializes in the current directory using the folder name as the project name:

```bash
    # Create a new project in ./my-app
  stack-effect init my-app --yes

  # Initialize in the current directory, deriving name from folder
  cd my-app && stack-effect init . --yes

  # Create in a specific parent directory
  stack-effect init my-app --yes --root /tmp
```
