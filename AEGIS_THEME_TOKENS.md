# AegisUi Theme Tokens

The semantic token layer is defined in `src/assets/css/aegis_theme.css`.

| Role | Token |
| --- | --- |
| App background | `--aegis-app-bg` |
| Shell / muted surface | `--aegis-shell-bg`, `--aegis-surface-muted` |
| Panel surfaces | `--aegis-surface`, `--aegis-surface-raised` |
| Inputs | `--aegis-surface-input` |
| Typography | `--aegis-text`, `--aegis-text-muted`, `--aegis-text-faint` |
| Borders | `--aegis-border`, `--aegis-border-subtle` |
| Accent | `--aegis-accent`, `--aegis-accent-soft`, `--aegis-accent-ink` |
| Status | `--aegis-success`, `--aegis-warning`, `--aegis-danger` |
| Intentional dark content | `--aegis-terminal-bg` |

Inherited component styles still using `--color_*` are bridged only inside the
Light appearance selector. New component work should prefer the semantic
tokens above.
